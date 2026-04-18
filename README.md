# WallAR — Wallpaper Shop Management Dashboard

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure Firebase
Copy `.env.local` and fill in your Firebase project credentials.
Enable **Authentication** (Email/Password), **Firestore**, and **Storage** in your Firebase project.

### 3. Firestore Security Rules
```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuth() { return request.auth != null; }
    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    function isAdmin() { return getUserData().role == 'admin'; }
    function belongsToShop(shopId) { return getUserData().shopId == shopId; }

    match /shops/{shopId} {
      allow read: if isAuth();
      allow write: if isAuth() && isAdmin();
    }
    match /users/{userId} {
      allow read: if isAuth();
      allow write: if isAuth() && (isAdmin() || request.auth.uid == userId);
    }
    match /{collection}/{docId} {
      allow read, write: if isAuth();
    }
  }
}
```

### 4. Firebase Storage Rules
```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 5. Bootstrap first admin user
In Firebase Console → Authentication → Add User → create admin email/password.
In Firestore → `users` collection → add document with the user's UID:
```json
{
  "uid": "<firebase_auth_uid>",
  "email": "admin@yourshop.com",
  "name": "Admin",
  "role": "admin",
  "shopId": "<shop_doc_id>",
  "isBlocked": false
}
```
In Firestore → `shops` collection → add document:
```json
{
  "nameEn": "My Wallpaper Shop",
  "nameUz": "Mening do'konim",
  "token": "SHOP-ABCDE",
  "isActive": true,
  "exchangeRate": 12500,
  "paymentTypes": [
    { "id": "cash", "nameEn": "Cash", "nameUz": "Naqd", "isActive": true },
    { "id": "card", "nameEn": "Card", "nameUz": "Karta", "isActive": true },
    { "id": "transfer", "nameEn": "Transfer", "nameUz": "O'tkazma", "isActive": true }
  ]
}
```

### 6. Run development server
```bash
npm run dev
```

---

## Firestore Collections Schema

| Collection | Key Fields |
|---|---|
| `shops` | nameEn, nameUz, token, isActive, exchangeRate, paymentTypes[] |
| `users` | uid, shopId, name, email, role, branchId, isBlocked |
| `wallpapers` | shopId, nameEn, nameUz, sellPrice, costPrice, stock, categoryId, supplierId, approvalStatus, images[], rollWidthCm, rollLengthM |
| `categories` | shopId, nameEn, nameUz, image, sortOrder |
| `orders` | shopId, customerPhone, wallpaperId, walls[], status, statusHistory[], branchId |
| `sales` | shopId, items[], totalAmount, totalCost, payments{}, status, craftsmanId, craftsmanBonus, receiptNumber |
| `stockMovements` | shopId, wallpaperId, type (in/out/sold/refunded), rolls, saleId, supplierId |
| `craftsmen` | shopId, name, phone, totalEarned, totalPaid, pendingBalance |
| `bonusTransactions` | shopId, craftsmanId, saleId, type (earned/paid/deducted), amount |
| `suppliers` | shopId, name, phone, address, totalPurchased, totalPaid, debt |
| `supplierTransactions` | shopId, supplierId, type, amount |
| `priceHistory` | wallpaperId, shopId, oldPrice, newPrice, reason, changedBy |
| `branches` | shopId, nameEn, nameUz, address, phone, isActive |
| `refunds` | shopId, saleId, items[], refundAmount, reason, bonusDeducted |

## Business Rules Summary
- Receipt cannot close unless payments total === sale total (enforced in `closeSale`)
- Stock reduced only when receipt status becomes `closed`
- Craftsman bonus only activates after receipt is closed
- Refund returns stock + deducts craftsman bonus proportionally
- Price changes saved to `priceHistory` with userId + timestamp
- Blocked users cannot login (checked in `loginWithToken`)
- Invalid shop token blocks login
- Sellers submitting wallpapers go to `pending` approval status; admins auto-approve
