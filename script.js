const API_URL = "http://localhost:3000/api";
let token = localStorage.getItem("jwt_token") || null;
let userRole = localStorage.getItem("user_role") || null;
let userName = localStorage.getItem("user_name") || null;

document.addEventListener("DOMContentLoaded", () => {
  if (token) {
    setupDashboard();
  } else {
    showView("auth-view");
  }
});

function switchAuthTab(type) {
  const custLoginForm = document.getElementById("cust-login-form");
  const custRegForm = document.getElementById("cust-reg-form");
  const adminLoginForm = document.getElementById("admin-login-form");

  const custLoginBtn = document.getElementById("tab-cust-login-btn");
  const custRegBtn = document.getElementById("tab-cust-reg-btn");
  const adminLoginBtn = document.getElementById("tab-admin-login-btn");

  custLoginForm.style.display = "none";
  custRegForm.style.display = "none";
  adminLoginForm.style.display = "none";

  custLoginBtn.className = "btn-secondary";
  custRegBtn.className = "btn-secondary";
  adminLoginBtn.className = "btn-secondary";

  const errorEl = document.getElementById("auth-error");
  if (errorEl) errorEl.textContent = "";

  if (type === "cust-login") {
    custLoginForm.style.display = "block";
    custLoginBtn.className = "btn-primary";
  } else if (type === "cust-reg") {
    custRegForm.style.display = "block";
    custRegBtn.className = "btn-primary";
  } else if (type === "admin-login") {
    adminLoginForm.style.display = "block";
    adminLoginBtn.className = "btn-primary";
  }
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach((v) => (v.style.display = "none"));
  const target = document.getElementById(viewId);
  if (target) target.style.display = "block";
}

async function handleAuth(e, actionType) {
  e.preventDefault();
  const username = e.target.username.value;
  const password = e.target.password.value;
  const errorEl = document.getElementById("auth-error");

  try {
    const endpoint = actionType === "register" ? "/register" : "/login";
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Authentication failed");

    token = data.token;
    userRole = data.role;
    userName = data.username;

    localStorage.setItem("jwt_token", token);
    localStorage.setItem("user_role", userRole);
    localStorage.setItem("user_name", userName);

    setupDashboard();
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.style.color = "red";
    }
  }
}

function setupDashboard() {
  showView("dashboard-view");
  const adminForms = document.getElementById("admin-forms");
  const mainLayout = document.getElementById("main-layout");
  const userBadge = document.getElementById("user-badge");
  const viewTitle = document.getElementById("view-title");

  userBadge.textContent = `${userName} (${userRole.toUpperCase()})`;

  if (userRole === "admin") {
    adminForms.style.display = "block";
    mainLayout.style.gridTemplateColumns = "1fr 2fr";
    viewTitle.textContent = "Inventory Management (Admin Portal)";
    loadSuppliers();
  } else {
    adminForms.style.display = "none";
    mainLayout.style.gridTemplateColumns = "1fr";
    viewTitle.textContent = "Customer Storefront";
  }

  loadProducts();
}

function logout() {
  token = null;
  userRole = null;
  userName = null;
  localStorage.clear();
  showView("auth-view");
}

async function loadProducts() {
  const res = await fetch(`${API_URL}/products`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const products = await res.json();
  const list = document.getElementById("product-list");
  if (!list) return;

  if (products.length === 0) {
    list.innerHTML = `<p style="padding: 1rem; color: #64748b;">No products available right now.</p>`;
    return;
  }

  list.innerHTML = `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="text-align: left; border-bottom: 2px solid #e2e8f0;">
          <th style="padding: 8px;">Image</th>
          <th style="padding: 8px;">Name</th>
          <th style="padding: 8px;">In Stock</th>
          <th style="padding: 8px;">Price</th>
          <th style="padding: 8px;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${products
          .map(
            (p) => `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px;">
              ${p.image ? `<img src="${p.image}" alt="${p.name}" width="45" height="45" style="border-radius: 8px; object-fit: cover;"/>` : "N/A"}
            </td>
            <td style="padding: 8px; font-weight: 600;">${p.name}</td>
            <td style="padding: 8px;">${p.quantity}</td>
            <td style="padding: 8px;">$${p.price.toFixed(2)}</td>
            <td style="padding: 8px;">
              ${
                userRole === "user"
                  ? `
                <button onclick="purchaseProduct(${p.id})" class="btn-success" ${p.quantity < 1 ? "disabled" : ""}>
                  ${p.quantity < 1 ? "Out of Stock" : "Buy Product"}
                </button>
              `
                  : `
                <button onclick="deleteProduct(${p.id})" class="btn-danger">Delete</button>
              `
              }
            </td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

async function purchaseProduct(id) {
  try {
    const res = await fetch(`${API_URL}/products/${id}/purchase`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert("Purchase successful!");
    loadProducts();
  } catch (err) {
    alert(`Purchase Failed: ${err.message}`);
  }
}

async function saveProduct(e) {
  e.preventDefault();
  try {
    const formData = new FormData(e.target);
    const res = await fetch(`${API_URL}/products`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add product");

    alert("Product added successfully!");
    e.target.reset();
    const preview = document.getElementById("image-preview");
    if (preview) preview.style.display = "none";
    loadProducts();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function deleteProduct(id) {
  if (!confirm("Are you sure you want to delete this product?")) return;
  try {
    const res = await fetch(`${API_URL}/products/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    loadProducts();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function loadSuppliers() {
  const res = await fetch(`${API_URL}/suppliers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const suppliers = await res.json();

  const select = document.getElementById("supplier-select");
  if (select) {
    select.innerHTML = suppliers
      .map((s) => `<option value="${s.id}">${s.name}</option>`)
      .join("");
  }

  const supplierList = document.getElementById("supplier-list");
  if (supplierList) {
    if (suppliers.length === 0) {
      supplierList.innerHTML = `<p style="font-size: 0.9rem; color: #64748b;">No suppliers found.</p>`;
      return;
    }
    supplierList.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${suppliers
          .map(
            (s) => `
          <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div>
              <strong>${s.name}</strong><br><small style="color: #64748b;">${s.contact || "No contact"}</small>
            </div>
            <button onclick="deleteSupplier(${s.id})" class="btn-danger" style="padding: 4px 10px; font-size: 0.8rem;">Delete</button>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
  }
}

async function saveSupplier(e) {
  e.preventDefault();
  try {
    const res = await fetch(`${API_URL}/suppliers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: e.target.name.value,
        contact: e.target.contact.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add supplier");

    alert("Supplier added successfully!");
    e.target.reset();
    loadSuppliers();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function deleteSupplier(id) {
  if (!confirm("Are you sure you want to delete this supplier?")) return;
  try {
    const res = await fetch(`${API_URL}/suppliers/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    loadSuppliers();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function previewImage(event) {
  const preview = document.getElementById("image-preview");
  if (preview && event.target.files[0]) {
    preview.src = URL.createObjectURL(event.target.files[0]);
    preview.style.display = "block";
  }
}
