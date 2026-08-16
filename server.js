const express = require("express");

const { Sequelize, DataTypes } = require("sequelize");

const bcrypt = require("bcryptjs");

const jwt = require("jsonwebtoken");

const multer = require("multer");

const path = require("path");

const cors = require("cors");

const fs = require("fs");

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_2026";

app.use(express.json());

app.use(cors());

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

app.use("/uploads", express.static(uploadDir));

// Database Setup

const sequelize = new Sequelize({
  dialect: "sqlite",

  storage: "./inventory.db",

  logging: false,
});

// Models

const User = sequelize.define("User", {
  username: { type: DataTypes.STRING, unique: true, allowNull: false },

  password: { type: DataTypes.STRING, allowNull: false },

  role: { type: DataTypes.STRING, defaultValue: "user" },
});

const Supplier = sequelize.define("Supplier", {
  name: { type: DataTypes.STRING, allowNull: false },

  contact: { type: DataTypes.STRING },
});

const Product = sequelize.define("Product", {
  name: { type: DataTypes.STRING, allowNull: false },

  quantity: { type: DataTypes.INTEGER, defaultValue: 0 },

  price: { type: DataTypes.FLOAT, defaultValue: 0.0 },

  image: { type: DataTypes.STRING },
});

Supplier.hasMany(Product);

Product.belongsTo(Supplier);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),

  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({ storage });

// Authentication Middlewares

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token)
    return res.status(401).json({ error: "Access denied. Token missing." });

  try {
    req.user = jwt.verify(token, JWT_SECRET);

    next();
  } catch (err) {
    res.status(400).json({ error: "Invalid token." });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res

      .status(403)

      .json({ error: "Access denied. Admin rights required." });
  }

  next();
};

// Customer Registration

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    const existing = await User.findOne({ where: { username } });

    if (existing)
      return res.status(400).json({ error: "Username already taken." });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,

      password: hashedPassword,

      role: "user",
    });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },

      JWT_SECRET,

      { expiresIn: "12h" },
    );

    res.status(201).json({ token, role: user.role, username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Failed to create customer account." });
  }
});

// Authentication Endpoint

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ where: { username } });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: "Invalid username or password." });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },

    JWT_SECRET,

    { expiresIn: "12h" },
  );

  res.json({ token, role: user.role, username: user.username });
});

// Product Endpoints

app.get("/api/products", authenticate, async (req, res) => {
  const products = await Product.findAll({ include: Supplier });

  res.json(products);
});

app.post(
  "/api/products",

  authenticate,

  requireAdmin,

  upload.single("image"),

  async (req, res) => {
    try {
      const { name, quantity, price, SupplierId } = req.body;

      const image = req.file ? `/uploads/${req.file.filename}` : null;

      const product = await Product.create({
        name,

        quantity: parseInt(quantity) || 0,

        price: parseFloat(price) || 0.0,

        SupplierId: SupplierId ? parseInt(SupplierId) : null,

        image,
      });

      res.status(201).json(product);
    } catch (err) {
      res

        .status(500)

        .json({ error: err.message || "Failed to create product." });
    }
  },
);

// Add Stock Endpoint (Admin Only)

app.patch(
  "/api/products/:id/stock",

  authenticate,

  requireAdmin,

  async (req, res) => {
    try {
      const { addQuantity } = req.body;

      const product = await Product.findByPk(req.params.id);

      if (!product)
        return res.status(404).json({ error: "Product not found." });

      const amount = parseInt(addQuantity);

      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "Invalid stock amount to add." });
      }

      product.quantity += amount;

      await product.save();

      res.json({ message: "Stock added successfully!", product });
    } catch (err) {
      res.status(500).json({ error: "Failed to update stock." });
    }
  },
);

app.post("/api/products/:id/purchase", authenticate, async (req, res) => {
  if (req.user.role === "admin") {
    return res.status(403).json({
      error: "Admins cannot purchase products. Please sign in as a customer.",
    });
  }

  const product = await Product.findByPk(req.params.id);

  if (!product) return res.status(404).json({ error: "Product not found." });

  if (product.quantity < 1)
    return res.status(400).json({ error: "Product is out of stock." });

  product.quantity -= 1;

  await product.save();

  res.json({ message: "Purchase successful!", product });
});

app.delete(
  "/api/products/:id",

  authenticate,

  requireAdmin,

  async (req, res) => {
    try {
      await Product.destroy({ where: { id: req.params.id } });

      res.json({ message: "Product deleted." });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete product." });
    }
  },
);

// Supplier Endpoints

app.get("/api/suppliers", authenticate, async (req, res) => {
  const suppliers = await Supplier.findAll();

  res.json(suppliers);
});

app.post("/api/suppliers", authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, contact } = req.body;

    if (!name)
      return res.status(400).json({ error: "Supplier name required." });

    const supplier = await Supplier.create({ name, contact });

    res.status(201).json(supplier);
  } catch (err) {
    res.status(500).json({ error: "Failed to create supplier." });
  }
});

app.delete(
  "/api/suppliers/:id",

  authenticate,

  requireAdmin,

  async (req, res) => {
    try {
      await Supplier.destroy({ where: { id: req.params.id } });

      res.json({ message: "Supplier deleted." });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete supplier." });
    }
  },
);

// Database Sync and Server Launch

const PORT = process.env.PORT || 3000;

sequelize

  .sync({ alter: true })

  .then(async () => {
    console.log("Database synced.");

    let adminUser = await User.findOne({ where: { username: "admin" } });

    if (!adminUser) {
      const hashedAdmin = await bcrypt.hash("admin123", 10);

      await User.create({
        username: "admin",

        password: hashedAdmin,

        role: "admin",
      });
    } else if (adminUser.role !== "admin") {
      adminUser.role = "admin";

      await adminUser.save();

      console.log('Updated existing admin account role to "admin"');
    }

    app.listen(PORT, () =>
      console.log(`Server running at http://localhost:${PORT}`),
    );
  })

  .catch((err) => console.error("Database connection failed:", err));
