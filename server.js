const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const { Sequelize, DataTypes } = require("sequelize");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = "your_super_secret_key_here";

app.use(cors());
app.use(express.json());

// Serve static frontend files (index.html, style.css, script.js) from the root directory
app.use(express.static(path.join(__dirname)));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Configure Multer for Image Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Initialize SQLite Database via Sequelize
const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "./database.sqlite",
  logging: false,
});

// Models Definition
const User = sequelize.define("User", {
  username: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, defaultValue: "user" }, // 'admin' or 'user'
});

const Supplier = sequelize.define("Supplier", {
  name: { type: DataTypes.STRING, allowNull: false },
  contact: { type: DataTypes.STRING, allowNull: true },
});

const Product = sequelize.define("Product", {
  name: { type: DataTypes.STRING, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  price: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.0 },
  image: { type: DataTypes.STRING, allowNull: true },
});

// Relationships
Supplier.hasMany(Product, { onDelete: "CASCADE" });
Product.belongsTo(Supplier);

// Middleware for JWT Authentication
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Access token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token" });
    req.user = user;
    next();
  });
}

// Middleware for Admin Authorization
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// Routes: Auth
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      password: hashedPassword,
      role: "user",
    });
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "1d" },
    );
    res.json({ token, role: user.role, username: user.username });
  } catch (err) {
    res.status(400).json({ error: "Username already exists or invalid data" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "1d" },
    );
    res.json({ token, role: user.role, username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

// Routes: Suppliers
app.get("/api/suppliers", authenticateToken, async (req, res) => {
  try {
    const suppliers = await Supplier.findAll();
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch suppliers" });
  }
});

app.post(
  "/api/suppliers",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { name, contact } = req.body;
      const supplier = await Supplier.create({ name, contact });
      res.status(201).json(supplier);
    } catch (err) {
      res.status(400).json({ error: "Failed to create supplier" });
    }
  },
);

app.delete(
  "/api/suppliers/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const supplier = await Supplier.findByPk(req.params.id);
      if (!supplier)
        return res.status(404).json({ error: "Supplier not found" });
      await supplier.destroy();
      res.json({ message: "Supplier deleted successfully" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete supplier" });
    }
  },
);

// Routes: Products
app.get("/api/products", authenticateToken, async (req, res) => {
  try {
    const products = await Product.findAll({ include: Supplier });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.post(
  "/api/products",
  authenticateToken,
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const { name, quantity, price, SupplierId } = req.body;
      const image = req.file ? `/uploads/${req.file.filename}` : null;
      const product = await Product.create({
        name,
        quantity: parseInt(quantity),
        price: parseFloat(price),
        SupplierId: SupplierId ? parseInt(SupplierId) : null,
        image,
      });
      res.status(201).json(product);
    } catch (err) {
      res.status(400).json({ error: "Failed to create product" });
    }
  },
);

app.patch(
  "/api/products/:id/stock",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { addQuantity } = req.body;
      const product = await Product.findByPk(req.params.id);
      if (!product) return res.status(404).json({ error: "Product not found" });
      product.quantity += parseInt(addQuantity);
      await product.save();
      res.json(product);
    } catch (err) {
      res.status(400).json({ error: "Failed to update stock" });
    }
  },
);

app.post("/api/products/:id/purchase", authenticateToken, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    if (product.quantity < 1)
      return res.status(400).json({ error: "Product is out of stock" });
    product.quantity -= 1;
    await product.save();
    res.json({ message: "Purchase successful", product });
  } catch (err) {
    res.status(500).json({ error: "Purchase failed" });
  }
});

app.delete(
  "/api/products/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const product = await Product.findByPk(req.params.id);
      if (!product) return res.status(404).json({ error: "Product not found" });
      await product.destroy();
      res.json({ message: "Product deleted successfully" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete product" });
    }
  },
);

// Database Sync & Seeding Default Data
sequelize
  .sync({ force: false })
  .then(async () => {
    console.log("Database connected successfully");

    // Seed Admin Account if not exists
    const adminExists = await User.findOne({ where: { username: "admin" } });
    if (!adminExists) {
      const hashedAdminPassword = await bcrypt.hash("admin123", 10);
      await User.create({
        username: "admin",
        password: hashedAdminPassword,
        role: "admin",
      });
      console.log(
        "Default admin created (username: admin, password: admin123)",
      );
    }

    // Seed Default Suppliers if none exist
    const supplierCount = await Supplier.count();
    if (supplierCount === 0) {
      const s1 = await Supplier.create({
        name: "Global Tech Supplies",
        contact: "support@globaltech.com",
      });
      const s2 = await Supplier.create({
        name: "Prime Wholesale Inc.",
        contact: "+1-800-555-0199",
      });

      // Seed Default Products linked to suppliers
      await Product.bulkCreate([
        {
          name: "Wireless Mechanical Keyboard",
          quantity: 12,
          price: 89.99,
          SupplierId: s1.id,
        },
        {
          name: "Ergonomic Gaming Mouse",
          quantity: 3,
          price: 49.99,
          SupplierId: s1.id,
        },
        {
          name: "UltraWide LED Monitor",
          quantity: 8,
          price: 299.99,
          SupplierId: s2.id,
        },
      ]);
      console.log(
        "Default suppliers and seeded products created successfully.",
      );
    }

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection error:", err);
  });
