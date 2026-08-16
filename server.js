const express = require("express");
const { Sequelize, DataTypes } = require("sequelize");
const multer = require("multer");
const path = require("path");

const app = express();
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Database setup (SQLite example)
const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "database.sqlite",
});

// Models
const Supplier = sequelize.define("Supplier", {
  name: { type: DataTypes.STRING, allowNull: false },
});

const Product = sequelize.define("Product", {
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  quantity: { type: DataTypes.INTEGER, defaultValue: 0, validate: { min: 0 } },
  price: { type: DataTypes.FLOAT, defaultValue: 0.0, validate: { min: 0 } },
  image: { type: DataTypes.STRING },
});

// Relationships
Supplier.hasMany(Product, { onDelete: "SET NULL" });
Product.belongsTo(Supplier);

// Multer Upload Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// Mock Middleware for Authentication & Authorization
function authenticate(req, res, next) {
  // Placeholder for real JWT auth logic
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "No token provided." });
  next();
}

function requireAdmin(req, res, next) {
  // Placeholder: Verify if user has admin role
  next();
}

// Routes: Get Products (with Supplier details included)
app.get("/api/products", authenticate, async (req, res) => {
  try {
    const products = await Product.findAll({
      include: [{ model: Supplier, attributes: ["id", "name"] }],
    });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Routes: Create Product (with validation against negative values and blanks)
app.post(
  "/api/products",
  authenticate,
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const { name, description, quantity, price, SupplierId } = req.body;

      if (!name || price === undefined || quantity === undefined) {
        return res
          .status(400)
          .json({ error: "Please fill in all required fields." });
      }
      if (parseFloat(price) < 0 || parseInt(quantity) < 0) {
        return res
          .status(400)
          .json({ error: "Price and quantity cannot be negative." });
      }

      const image = req.file ? `/uploads/${req.file.filename}` : null;

      const product = await Product.create({
        name,
        description,
        quantity: parseInt(quantity),
        price: parseFloat(price),
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

// Routes: Get Suppliers
app.get("/api/suppliers", authenticate, async (req, res) => {
  try {
    const suppliers = await Supplier.findAll();
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync database and start server
sequelize.sync().then(() => {
  app.listen(3000, () => console.log("Server running on port 3000"));
});
