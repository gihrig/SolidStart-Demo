# Product Requirements Document (PRD)
## EAGems Custom E-commerce Web Application

**Document Version:** 1.0.0
**Date:** 2024-12-28
**Project:** EAGems - Custom Jewelry E-commerce Platform
**Development Stack:** Rust Web Application with Leptos Frontend

---

## 1. Executive Summary

### 1.1 Project Overview
EAGems is a custom e-commerce platform specializing in gemstones, cabochons, and custom jewelry pieces. The application requires a complete rebuild from a legacy PHP system to a modern Rust-based architecture with responsive design, enhanced catalog management, and integrated shopping cart functionality.

### 1.2 Business Objectives
- Modernize the existing e-commerce platform with current web technologies
- Improve mobile responsiveness and accessibility (WCAG compliance)
- Implement custom shopping cart with multiple payment processor support
- Enable dynamic pricing with discount management capabilities
- Enhance catalog management with admin interfaces
- Optimize for performance and SEO

### 1.3 Technical Approach
- **Backend:** Rust with Axum web framework
- **Frontend:** Leptos reactive framework with Tailwind CSS v4.1
- **Database:** PostgreSQL with SQLx
- **Testing:** Rust test framework and Playwright for E2E testing
- **Deployment:** Docker containers on VPS infrastructure

---

## 2. Software Bill of Materials (SBOM)

### 2.1 Core Technologies

#### Backend Technologies
- **Rust** (Edition 2021)
- **Axum** v0.8 - Web application framework
- **SQLx** v0.8 - Async PostgreSQL driver with compile-time checked queries
- **Sea-Query** v0.32 - SQL query builder
- **ModQL** v0.4.1 - MongoDB-like filter system for SQL
- **Tower** - Middleware and service composition
- **Tokio** v1.x - Async runtime

#### Frontend Technologies
- **Leptos** v0.8.6 - Reactive web framework for Rust
- **Tailwind CSS** v4.1 - Utility-first CSS framework
- **Tailwind Plus Components** - Premium component library
- **WASM** - WebAssembly for client-side Rust code

#### Database & Storage
- **PostgreSQL** v17 - Primary database
- **SQLite** - Development and testing database option
- **UUID** v1 - Unique identifier generation
- **Time** v0.3 - Date/time handling with timezone support

#### Authentication & Security
- **Tower-Cookies** v0.11 - Cookie management
- **lib-auth** (custom) - Password hashing and token management
- **Argon2** - Password hashing algorithm
- **HMAC-SHA256** - Token generation

#### Testing & Quality
- **Playwright** v1.54.2 - End-to-end testing framework
- **httpc-test** v0.1 - HTTP client testing
- **serial_test** v3 - Sequential test execution
- **Tracing** v0.1 - Application instrumentation
- **cargo-watch** - Development hot-reload

#### Infrastructure & Deployment
- **Docker** - Containerization
- **docker-compose** - Multi-container orchestration
- **Nginx** - Reverse proxy and static file serving
- **Virtualmin** - Server management (production)

#### Development Tools
- **Serde** v1 - Serialization/deserialization
- **derive_more** v1.0.0-beta - Derive macros
- **strum_macros** v0.26 - Enum utilities
- **rpc-router** v0.1.3 - JSON-RPC routing

---

## 3. Architecture Overview

### 3.1 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client Browser                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Leptos WASM Application                  │   │
│  │    (Reactive Components + Tailwind CSS)          │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    Nginx Reverse Proxy                  │
└─────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
┌──────────────────────┐   ┌──────────────────────┐
│   Static Assets      │   │    Axum Web Server   │
│   (HTML/CSS/JS)      │   │     (Port 8080)      │
└──────────────────────┘   └──────────────────────┘
                                        │
                            ┌───────────┴───────────┐
                            ▼                       ▼
                ┌──────────────────────┐  ┌──────────────────────┐
                │   API Routes         │  │   RPC Handlers       │
                │   (/api/*)           │  │   (JSON-RPC)         │
                └──────────────────────┘  └──────────────────────┘
                            │
                            ▼
                ┌──────────────────────┐
                │   Model Manager      │
                │   (Business Logic)   │
                └──────────────────────┘
                            │
                            ▼
                ┌──────────────────────┐
                │   PostgreSQL DB      │
                │   (Data Persistence) │
                └──────────────────────┘
```

### 3.2 Project Structure

```
rust-web-app/
├── crates/
│   ├── libs/
│   │   ├── lib-utils/      # Base utilities (base64, time)
│   │   ├── lib-rpc-core/   # RPC utilities
│   │   ├── lib-auth/       # Authentication & authorization
│   │   ├── lib-core/       # Core business logic & models
│   │   └── lib-web/        # Web middleware & routing
│   ├── services/
│   │   └── web-server/     # Main web application
│   └── tools/
│       └── gen-key/        # Key generation utility
├── sql/
│   └── dev_initial/        # Database schema & seeds
├── web-folder/             # Static assets
├── tests/                  # E2E Playwright tests
└── docker/                 # Docker configurations
```

---

## 4. Backend Development Requirements

### 4.1 Database Schema Evolution

#### Current Schema (Base Application)
- User management (user, org)
- Agent/Conv system (for demo purposes)
- Audit fields (cid, ctime, mid, mtime)

#### Required Schema Additions for E-commerce

```sql
-- Catalog Categories
CREATE TABLE catalog (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    parent_id BIGINT REFERENCES catalog(id),
    slug VARCHAR(128) NOT NULL UNIQUE,
    name VARCHAR(256) NOT NULL,
    description TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    meta_title VARCHAR(1024),
    meta_description VARCHAR(2048),
    -- Audit fields
    cid BIGINT NOT NULL,
    ctime TIMESTAMPTZ NOT NULL,
    mid BIGINT NOT NULL,
    mtime TIMESTAMPTZ NOT NULL
);

-- Catalog Items (Products)
CREATE TABLE catalog_item (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    item_id VARCHAR(128) NOT NULL UNIQUE,
    catalog_id BIGINT REFERENCES catalog(id),
    name VARCHAR(1024) NOT NULL,
    title VARCHAR(1024),
    description VARCHAR(2048),
    price DECIMAL(10,2) NOT NULL,
    sale_price DECIMAL(10,2),
    shipping_amount DECIMAL(8,2) DEFAULT 0,
    stock_quantity INT DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    weight_grams DECIMAL(10,2),
    dimensions_json JSONB,
    -- SEO fields
    rss_title VARCHAR(1024),
    rss_description VARCHAR(2048),
    -- Audit fields
    cid BIGINT NOT NULL,
    ctime TIMESTAMPTZ NOT NULL,
    mid BIGINT NOT NULL,
    mtime TIMESTAMPTZ NOT NULL
);

-- Product Images
CREATE TABLE product_image (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    catalog_item_id BIGINT REFERENCES catalog_item(id) ON DELETE CASCADE,
    image_url VARCHAR(512) NOT NULL,
    thumbnail_url VARCHAR(512),
    alt_text VARCHAR(256),
    display_order INT DEFAULT 0,
    is_primary BOOLEAN DEFAULT false,
    -- Audit fields
    cid BIGINT NOT NULL,
    ctime TIMESTAMPTZ NOT NULL,
    mid BIGINT NOT NULL,
    mtime TIMESTAMPTZ NOT NULL
);

-- Shopping Cart
CREATE TABLE cart (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id BIGINT REFERENCES "user"(id),
    session_id UUID,
    expires_at TIMESTAMPTZ,
    -- Audit fields
    cid BIGINT NOT NULL,
    ctime TIMESTAMPTZ NOT NULL,
    mid BIGINT NOT NULL,
    mtime TIMESTAMPTZ NOT NULL
);

-- Cart Items
CREATE TABLE cart_item (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    cart_id BIGINT REFERENCES cart(id) ON DELETE CASCADE,
    catalog_item_id BIGINT REFERENCES catalog_item(id),
    quantity INT NOT NULL DEFAULT 1,
    price_at_time DECIMAL(10,2) NOT NULL,
    -- Audit fields
    cid BIGINT NOT NULL,
    ctime TIMESTAMPTZ NOT NULL,
    mid BIGINT NOT NULL,
    mtime TIMESTAMPTZ NOT NULL
);

-- Orders
CREATE TABLE orders (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id BIGINT REFERENCES "user"(id),
    order_number VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    subtotal DECIMAL(10,2) NOT NULL,
    shipping_amount DECIMAL(8,2) NOT NULL,
    tax_amount DECIMAL(8,2) DEFAULT 0,
    discount_amount DECIMAL(8,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(32),
    payment_status VARCHAR(32),
    shipping_address_json JSONB,
    billing_address_json JSONB,
    notes TEXT,
    -- Audit fields
    cid BIGINT NOT NULL,
    ctime TIMESTAMPTZ NOT NULL,
    mid BIGINT NOT NULL,
    mtime TIMESTAMPTZ NOT NULL
);

-- Discount Codes
CREATE TABLE discount_code (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    code VARCHAR(32) NOT NULL UNIQUE,
    description VARCHAR(256),
    discount_type VARCHAR(32) NOT NULL, -- 'percentage' or 'fixed'
    discount_value DECIMAL(10,2) NOT NULL,
    min_order_amount DECIMAL(10,2),
    max_uses INT,
    uses_count INT DEFAULT 0,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    -- Audit fields
    cid BIGINT NOT NULL,
    ctime TIMESTAMPTZ NOT NULL,
    mid BIGINT NOT NULL,
    mtime TIMESTAMPTZ NOT NULL
);
```

### 4.2 Backend Implementation Steps

#### Phase 1: Core Model Implementation
1. **Create E-commerce Models**
   - Implement Catalog model with CRUD operations
   - Implement CatalogItem model with inventory management
   - Create ProductImage model for image management
   - Build Cart and CartItem models with session support

2. **Business Logic Components (BMC)**
   - CatalogBmc with hierarchical category support
   - CatalogItemBmc with stock management
   - CartBmc with session/user cart merging
   - OrderBmc with state machine for order workflow
   - DiscountBmc with validation logic

3. **API Endpoints**
   - RESTful routes for public catalog browsing
   - Protected admin routes for catalog management
   - Cart API with session-based authentication
   - Order processing endpoints
   - Admin dashboard API endpoints

#### Phase 2: Advanced Features
1. **Search & Filtering**
   - Full-text search implementation using PostgreSQL
   - Faceted search for product attributes
   - Price range filtering
   - Category-based filtering

2. **Inventory Management**
   - Stock tracking with atomic updates
   - Low stock alerts
   - Reserved stock for cart items

3. **Pricing Engine**
   - Dynamic pricing rules
   - Bulk discount calculations
   - Sale price scheduling
   - Currency conversion support (future)

#### Phase 3: Integration Layer
1. **Payment Processing**
   - PayPal integration module
   - Stripe integration (optional)
   - Payment webhook handlers
   - Transaction logging

2. **Shipping Integration**
   - Shipping rate calculation
   - Multiple shipping method support
   - Address validation
   - Tracking number management

3. **Email Notifications**
   - Order confirmation emails
   - Shipping notifications
   - Abandoned cart reminders
   - Newsletter integration

---

## 5. Frontend Development Requirements

### 5.1 Leptos Component Architecture

#### Core Components Structure
```
components/
├── layout/
│   ├── Header.rs           # Site header with responsive menu
│   ├── Navigation.rs       # Main navigation component
│   ├── Footer.rs          # Site footer
│   └── Layout.rs          # Main layout wrapper
├── catalog/
│   ├── CategoryList.rs    # Category navigation
│   ├── ProductGrid.rs     # Product listing grid
│   ├── ProductCard.rs     # Individual product card
│   ├── ProductDetail.rs   # Product detail view
│   └── ImageGallery.rs    # Product image carousel
├── cart/
│   ├── CartIcon.rs        # Cart icon with count
│   ├── CartDrawer.rs      # Slide-out cart
│   ├── CartItem.rs        # Individual cart item
│   └── CartSummary.rs     # Cart totals
├── checkout/
│   ├── CheckoutForm.rs    # Multi-step checkout
│   ├── AddressForm.rs     # Shipping/billing address
│   ├── PaymentForm.rs     # Payment method selection
│   └── OrderReview.rs     # Order confirmation
├── admin/
│   ├── Dashboard.rs       # Admin dashboard
│   ├── ProductForm.rs     # Product CRUD form
│   ├── OrderList.rs       # Order management
│   └── Analytics.rs       # Sales analytics
└── common/
    ├── Button.rs          # Reusable button component
    ├── Input.rs           # Form input components
    ├── Modal.rs           # Modal dialog
    ├── Toast.rs           # Notification system
    └── Loading.rs         # Loading indicators
```

### 5.2 Page Implementation

#### Public Pages
1. **Home Page**
   - Hero section with featured products
   - Category showcase
   - New arrivals section
   - Newsletter signup

2. **Catalog Pages**
   - Category listing with breadcrumbs
   - Product grid with pagination
   - Sorting and filtering sidebar
   - Quick view modal

3. **Product Detail Page**
   - Image gallery with zoom
   - Product information tabs
   - Related products
   - Add to cart with quantity

4. **Shopping Cart**
   - Cart item management
   - Quantity updates
   - Discount code application
   - Shipping calculator

5. **Checkout Flow**
   - Guest checkout option
   - Address management
   - Payment method selection
   - Order confirmation

#### Admin Pages
1. **Dashboard**
   - Sales metrics
   - Recent orders
   - Low stock alerts
   - Quick actions

2. **Product Management**
   - Product listing with search
   - Create/Edit product forms
   - Bulk operations
   - Image upload with drag-drop

3. **Order Management**
   - Order listing with filters
   - Order detail view
   - Status updates
   - Refund processing

4. **Customer Management**
   - Customer listing
   - Order history
   - Communication log

### 5.3 Responsive Design Requirements

#### Breakpoints
```css
/* Mobile First Approach */
/* Base: 0-639px (Mobile) */
/* sm: 640px+ (Tablet Portrait) */
/* md: 768px+ (Tablet Landscape) */
/* lg: 1024px+ (Desktop) */
/* xl: 1280px+ (Large Desktop) */
/* 2xl: 1536px+ (Extra Large) */
```

#### Mobile Optimizations
- Touch-friendly interface (min 44px touch targets)
- Swipe gestures for image galleries
- Bottom navigation for key actions
- Simplified checkout flow
- Progressive disclosure for complex forms

#### Performance Targets
- First Contentful Paint: < 1.5s
- Time to Interactive: < 3.5s
- Cumulative Layout Shift: < 0.1
- Largest Contentful Paint: < 2.5s

### 5.4 Accessibility Requirements

#### WCAG 2.1 Level AA Compliance
- Semantic HTML structure
- ARIA labels and landmarks
- Keyboard navigation support
- Focus management
- Screen reader optimization
- Color contrast ratios (4.5:1 normal, 3:1 large text)
- Error identification and suggestions
- Skip navigation links

---

## 6. Testing Strategy

### 6.1 Unit Testing

#### Backend Unit Tests
```rust
// Model tests
mod catalog_tests {
    - test_create_catalog()
    - test_update_catalog()
    - test_delete_catalog()
    - test_catalog_hierarchy()
}

mod cart_tests {
    - test_add_to_cart()
    - test_update_quantity()
    - test_remove_from_cart()
    - test_cart_expiration()
}

mod order_tests {
    - test_create_order()
    - test_order_state_transitions()
    - test_payment_processing()
    - test_inventory_deduction()
}
```

#### Frontend Component Tests
```rust
// Leptos component tests
mod component_tests {
    - test_product_card_rendering()
    - test_cart_updates()
    - test_form_validation()
    - test_responsive_behavior()
}
```

### 6.2 Integration Testing

#### API Integration Tests
- Authentication flow testing
- Cart session management
- Order processing workflow
- Payment gateway mocking
- Database transaction testing

### 6.3 End-to-End Testing with Playwright

#### Test Scenarios
```typescript
// Critical User Journeys
describe('E-commerce Flow', () => {
  test('Browse catalog and add to cart')
  test('Guest checkout process')
  test('User registration and login')
  test('Apply discount code')
  test('Complete purchase with PayPal')
})

describe('Admin Functions', () => {
  test('Create new product')
  test('Update inventory')
  test('Process order')
  test('Generate reports')
})

describe('Responsive Design', () => {
  test('Mobile navigation')
  test('Touch interactions')
  test('Form usability on mobile')
})
```

#### Performance Testing
- Load testing with concurrent users
- Database query optimization
- CDN and caching validation
- API response time monitoring

---

## 7. Implementation Phases

### 7.1 Phase 1: Foundation (Week 1-2)
- [ ] Set up development environment
- [ ] Configure PostgreSQL database
- [ ] Implement base models (Catalog, CatalogItem)
- [ ] Create basic API endpoints
- [ ] Set up Leptos project structure
- [ ] Implement basic layout components
- [ ] Deploy to development server

### 7.2 Phase 2: Core Features (Week 3-4)
- [ ] Complete all e-commerce models
- [ ] Implement cart functionality
- [ ] Build product listing pages
- [ ] Create product detail pages
- [ ] Add responsive navigation
- [ ] Implement search functionality
- [ ] Set up Playwright tests

### 7.3 Phase 3: Advanced Features (Week 5-6)
- [ ] Integrate PayPal checkout
- [ ] Implement discount system
- [ ] Build admin dashboard
- [ ] Add order management
- [ ] Create email notifications
- [ ] Implement inventory tracking
- [ ] Complete responsive design

### 7.4 Phase 4: Polish & Deploy (Week 7-8)
- [ ] Performance optimization
- [ ] SEO implementation
- [ ] Accessibility audit
- [ ] Security review
- [ ] Data migration from legacy system
- [ ] Production deployment
- [ ] User training

---

## 8. Security Considerations

### 8.1 Authentication & Authorization
- Secure password hashing (Argon2)
- JWT token management
- Role-based access control (RBAC)
- Session management with timeout
- CSRF protection

### 8.2 Data Protection
- SQL injection prevention via parameterized queries
- XSS protection through input sanitization
- HTTPS enforcement
- Secure cookie flags
- Rate limiting on API endpoints

### 8.3 Payment Security
- PCI DSS compliance
- No storage of credit card data
- Secure payment gateway integration
- Transaction logging and audit trail

---

## 9. Performance Optimization

### 9.1 Backend Optimization
- Database indexing strategy
- Query optimization with EXPLAIN ANALYZE
- Connection pooling
- Caching layer (Redis future consideration)
- Async request handling

### 9.2 Frontend Optimization
- Code splitting with dynamic imports
- Image lazy loading
- WebP image format with fallbacks
- CSS purging for production
- WASM bundle size optimization
- Service worker for offline support

### 9.3 Infrastructure
- CDN for static assets
- Gzip/Brotli compression
- HTTP/2 support
- Database replication (future)
- Load balancing (future)

---

## 10. Monitoring & Analytics

### 10.1 Application Monitoring
- Error tracking with structured logging
- Performance metrics collection
- Uptime monitoring
- Database query performance tracking

### 10.2 Business Analytics
- Sales metrics dashboard
- Customer behavior tracking
- Conversion funnel analysis
- A/B testing framework

---

## 11. Maintenance & Support

### 11.1 Documentation
- API documentation with examples
- Component storybook
- Deployment guide
- Admin user manual
- Developer onboarding guide

### 11.2 Backup Strategy
- Daily automated database backups
- Image backup to cloud storage
- Configuration version control
- Disaster recovery plan

### 11.3 Update Process
- Semantic versioning
- Blue-green deployment
- Database migration scripts
- Rollback procedures

---

## 12. Success Metrics

### 12.1 Technical Metrics
- Page load time < 2 seconds
- 99.9% uptime
- Zero critical security vulnerabilities
- 80%+ code coverage
- Mobile performance score > 90

### 12.2 Business Metrics
- Conversion rate improvement
- Cart abandonment reduction
- Average order value increase
- Customer satisfaction score
- Return customer rate

---

## 13. Risk Assessment

### 13.1 Technical Risks
- **Risk:** Leptos ecosystem maturity
  - **Mitigation:** Fallback to server-side rendering if needed

- **Risk:** Database migration complexity
  - **Mitigation:** Phased migration with parallel running

- **Risk:** Payment integration issues
  - **Mitigation:** Extensive testing in sandbox environment

### 13.2 Business Risks
- **Risk:** User adoption of new interface
  - **Mitigation:** User training and gradual rollout

- **Risk:** SEO impact during migration
  - **Mitigation:** 301 redirects and sitemap updates

---

## 14. Appendices

### 14.1 API Endpoint Reference
```
GET    /api/catalog                    # List all categories
GET    /api/catalog/{id}              # Get category with items
GET    /api/catalog/{id}/items        # Get category items
GET    /api/products                  # List all products
GET    /api/products/{id}             # Get product details
GET    /api/cart                      # Get current cart
POST   /api/cart/items                # Add to cart
PUT    /api/cart/items/{id}           # Update cart item
DELETE /api/cart/items/{id}           # Remove from cart
POST   /api/checkout                  # Process checkout
POST   /api/orders                    # Create order
GET    /api/orders/{id}               # Get order details

# Admin endpoints (protected)
POST   /api/admin/products            # Create product
PUT    /api/admin/products/{id}       # Update product
DELETE /api/admin/products/{id}       # Delete product
GET    /api/admin/orders              # List orders
PUT    /api/admin/orders/{id}/status  # Update order status
```

### 14.2 Database Migration Scripts
- To be developed during implementation
- Version controlled in `/sql/migrations/`

### 14.3 Environment Variables
```env
DATABASE_URL=postgresql://user:pass@localhost/eagems
RUST_LOG=info
WEB_FOLDER=web-folder
PAYPAL_CLIENT_ID=xxx
PAYPAL_CLIENT_SECRET=xxx
STRIPE_PUBLIC_KEY=xxx
STRIPE_SECRET_KEY=xxx
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@eagems.com
SMTP_PASS=xxx
```

---

## Document Revision History

| Version | Date       | Author | Changes                   |
| ------- | ---------- | ------ | ------------------------- |
| 1.0.0   | 2024-12-28 | System | Initial document creation |

---

*End of Product Requirements Document*
 res.json().await.unwrap();
    assert_eq!(cart.items.len(), 0);
}
```

---

## 20. Performance Optimization Guidelines

### 20.1 Database Optimization

#### Index Strategy
```sql
-- Critical indexes for e-commerce queries
CREATE INDEX idx_catalog_slug ON catalog(slug) WHERE is_active = true;
CREATE INDEX idx_catalog_parent ON catalog(parent_id) WHERE is_active = true;
CREATE INDEX idx_catalog_item_catalog ON catalog_item(catalog_id) WHERE is_active = true;
CREATE INDEX idx_catalog_item_price ON catalog_item(price) WHERE is_active = true;
CREATE INDEX idx_catalog_item_featured ON catalog_item(is_featured) WHERE is_active = true;
CREATE INDEX idx_product_image_item ON product_image(catalog_item_id, display_order);
CREATE INDEX idx_cart_session ON cart(session_id) WHERE user_id IS NULL;
CREATE INDEX idx_cart_user ON cart(user_id);
CREATE INDEX idx_orders_user ON orders(user_id, ctime DESC);
CREATE INDEX idx_orders_status ON orders(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_discount_code ON discount_code(code) WHERE is_active = true;

-- Full-text search indexes
CREATE INDEX idx_catalog_item_search ON catalog_item
USING gin(to_tsvector('english', name || ' ' || description));
```

#### Query Optimization Examples
```rust
// Optimized product listing with eager loading
impl CatalogItemBmc {
    pub async fn list_with_images(
        ctx: &Ctx,
        mm: &ModelManager,
        catalog_id: i64,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ProductWithImages>> {
        let db = mm.db();

        // Single query with lateral join for images
        let products = sqlx::query_as!(
            ProductWithImages,
            r#"
            SELECT
                ci.*,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', pi.id,
                            'url', pi.image_url,
                            'thumbnail', pi.thumbnail_url,
                            'alt_text', pi.alt_text
                        ) ORDER BY pi.display_order
                    ) FILTER (WHERE pi.id IS NOT NULL),
                    '[]'::json
                ) as images
            FROM catalog_item ci
            LEFT JOIN LATERAL (
                SELECT * FROM product_image
                WHERE catalog_item_id = ci.id
                ORDER BY display_order
                LIMIT 5
            ) pi ON true
            WHERE ci.catalog_id = $1
                AND ci.is_active = true
            GROUP BY ci.id
            ORDER BY ci.display_order, ci.name
            LIMIT $2 OFFSET $3
            "#,
            catalog_id,
            limit,
            offset
        )
        .fetch_all(db)
        .await?;

        Ok(products)
    }
}
```

### 20.2 Caching Strategy

#### Application-Level Caching
```rust
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use std::time::{Duration, Instant};

pub struct CacheEntry<T> {
    data: T,
    expires_at: Instant,
}

pub struct AppCache<T> {
    store: Arc<RwLock<HashMap<String, CacheEntry<T>>>>,
    ttl: Duration,
}

impl<T: Clone> AppCache<T> {
    pub fn new(ttl: Duration) -> Self {
        Self {
            store: Arc::new(RwLock::new(HashMap::new())),
            ttl,
        }
    }

    pub async fn get(&self, key: &str) -> Option<T> {
        let store = self.store.read().await;
        if let Some(entry) = store.get(key) {
            if entry.expires_at > Instant::now() {
                return Some(entry.data.clone());
            }
        }
        None
    }

    pub async fn set(&self, key: String, value: T) {
        let mut store = self.store.write().await;
        store.insert(key, CacheEntry {
            data: value,
            expires_at: Instant::now() + self.ttl,
        });
    }
}

// Usage in catalog service
pub struct CatalogService {
    mm: ModelManager,
    cache: AppCache<Vec<Catalog>>,
}

impl CatalogService {
    pub async fn get_active_catalogs(&self) -> Result<Vec<Catalog>> {
        const CACHE_KEY: &str = "active_catalogs";

        // Check cache first
        if let Some(catalogs) = self.cache.get(CACHE_KEY).await {
            return Ok(catalogs);
        }

        // Fetch from database
        let catalogs = CatalogBmc::list_active(&self.mm).await?;

        // Store in cache
        self.cache.set(CACHE_KEY.to_string(), catalogs.clone()).await;

        Ok(catalogs)
    }
}
```

### 20.3 WASM Bundle Optimization

#### Leptos Build Configuration
```toml
# Cargo.toml
[profile.wasm-release]
inherits = "release"
opt-level = 'z'     # Optimize for size
lto = true          # Link-time optimization
codegen-units = 1   # Single codegen unit for better optimization
panic = "abort"     # Smaller panic handler
strip = true        # Strip symbols

[dependencies.web-sys]
version = "0.3"
features = [
    "Document",
    "Element",
    "HtmlElement",
    "Window",
    "Storage",
    "Location",
    "History",
    # Only include what's actually used
]
```

#### Code Splitting Strategy
```rust
// Lazy load admin components
use leptos::*;

#[component]
pub fn App(cx: Scope) -> impl IntoView {
    let route = use_route();

    view! { cx,
        <Router>
            <Routes>
                <Route path="/" view=HomePage />
                <Route path="/catalog/*" view=CatalogPages />
                <Route path="/products/:id" view=ProductDetail />
                <Route path="/cart" view=ShoppingCart />
                <Route path="/checkout" view=Checkout />

                // Lazy load admin section
                <Route
                    path="/admin/*"
                    view=move |cx| {
                        // Dynamic import for admin bundle
                        view! { cx,
                            <Suspense fallback=move || view! { cx, "Loading admin..." }>
                                <AdminModule />
                            </Suspense>
                        }
                    }
                />
            </Routes>
        </Router>
    }
}
```

---

## 21. Security Implementation

### 21.1 Authentication Middleware
```rust
use axum::{
    extract::Request,
    middleware::Next,
    response::Response,
};
use tower_cookies::Cookies;

pub async fn require_auth(
    cookies: Cookies,
    mut req: Request,
    next: Next,
) -> Result<Response, Error> {
    let token = cookies
        .get(AUTH_TOKEN_COOKIE)
        .map(|c| c.value())
        .ok_or(Error::AuthFailNoToken)?;

    // Validate token
    let user = validate_token(token).await?;

    // Add user to request extensions
    req.extensions_mut().insert(user);

    Ok(next.run(req).await)
}

pub async fn require_admin(
    cookies: Cookies,
    mut req: Request,
    next: Next,
) -> Result<Response, Error> {
    let token = cookies
        .get(AUTH_TOKEN_COOKIE)
        .map(|c| c.value())
        .ok_or(Error::AuthFailNoToken)?;

    let user = validate_token(token).await?;

    // Check admin role
    if !user.roles.contains(&Role::Admin) {
        return Err(Error::AuthFailPermission);
    }

    req.extensions_mut().insert(user);

    Ok(next.run(req).await)
}
```

### 21.2 Input Validation
```rust
use validator::{Validate, ValidationError};

#[derive(Debug, Deserialize, Validate)]
pub struct CreateProductRequest {
    #[validate(length(min = 1, max = 128))]
    pub item_id: String,

    #[validate(length(min = 1, max = 1024))]
    pub name: String,

    #[validate(length(max = 2048))]
    pub description: Option<String>,

    #[validate(range(min = 0.01, max = 9999.99))]
    pub price: f64,

    #[validate(custom = "validate_sale_price")]
    pub sale_price: Option<f64>,

    #[validate(range(min = 0))]
    pub stock_quantity: i32,
}

fn validate_sale_price(sale_price: &f64) -> Result<(), ValidationError> {
    if *sale_price <= 0.0 || *sale_price >= 9999.99 {
        return Err(ValidationError::new("invalid_sale_price"));
    }
    Ok(())
}

// Usage in handler
pub async fn create_product(
    State(mm): State<ModelManager>,
    ctx: Ctx,
    Json(mut payload): Json<CreateProductRequest>,
) -> Result<Json<Product>> {
    // Validate input
    payload.validate()?;

    // Sanitize HTML content
    if let Some(desc) = &mut payload.description {
        *desc = sanitize_html(desc);
    }

    // Create product
    let product = CatalogItemBmc::create(
        &ctx,
        &mm,
        payload.into(),
    ).await?;

    Ok(Json(product))
}
```

### 21.3 Rate Limiting
```rust
use tower_governor::{Governor, GovernorConfig};
use std::sync::Arc;

pub fn rate_limit_layer() -> Governor<String, NoOpMiddleware> {
    let config = Arc::new(
        GovernorConfig::default()
            .per_second(10)
            .burst_size(20)
            .use_headers()
            .key_extractor(|req: &Request<Body>| {
                // Extract IP or user ID for rate limiting
                req.headers()
                    .get("x-forwarded-for")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("unknown")
                    .to_string()
            })
    );

    Governor::new(config)
}

// Apply to routes
let app = Router::new()
    .route("/api/checkout", post(checkout))
    .layer(rate_limit_layer());
```

---

## 22. DevOps and CI/CD

### 22.1 GitHub Actions Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  CARGO_TERM_COLOR: always
  SQLX_OFFLINE: true

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
    - uses: actions/checkout@v3

    - name: Install Rust
      uses: actions-rs/toolchain@v1
      with:
        toolchain: stable
        override: true

    - name: Cache dependencies
      uses: actions/cache@v3
      with:
        path: |
          ~/.cargo/registry
          ~/.cargo/git
          target
        key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}

    - name: Run migrations
      run: |
        cargo install sqlx-cli --no-default-features --features postgres
        sqlx migrate run
      env:
        DATABASE_URL: postgresql://postgres:test@localhost/eagems_test

    - name: Run tests
      run: cargo test --all-features
      env:
        DATABASE_URL: postgresql://postgres:test@localhost/eagems_test

    - name: Run Playwright tests
      run: |
        npm ci
        npx playwright install
        npx playwright test

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
    - uses: actions/checkout@v3

    - name: Build Docker image
      run: |
        docker build -t eagems:${{ github.sha }} .
        docker tag eagems:${{ github.sha }} eagems:latest

    - name: Push to registry
      run: |
        echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
        docker push eagems:${{ github.sha }}
        docker push eagems:latest

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
    - name: Deploy to production
      uses: appleboy/ssh-action@v0.1.5
      with:
        host: ${{ secrets.PRODUCTION_HOST }}
        username: ${{ secrets.PRODUCTION_USER }}
        key: ${{ secrets.PRODUCTION_SSH_KEY }}
        script: |
          cd /opt/eagems
          docker-compose pull
          docker-compose up -d --no-deps web-server
          docker system prune -f
```

### 22.2 Docker Compose Production
```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  postgres:
    image: postgres:17
    restart: always
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: eagems
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    networks:
      - eagems_network
    command: >
      postgres
      -c max_connections=200
      -c shared_buffers=256MB
      -c effective_cache_size=1GB
      -c maintenance_work_mem=64MB
      -c checkpoint_completion_target=0.9
      -c wal_buffers=16MB
      -c random_page_cost=1.1
      -c effective_io_concurrency=200

  web-server:
    image: eagems:latest
    restart: always
    environment:
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@postgres/eagems
      RUST_LOG: info
      ENVIRONMENT: production
      SECRET_KEY: ${SECRET_KEY}
      PAYPAL_CLIENT_ID: ${PAYPAL_CLIENT_ID}
      PAYPAL_CLIENT_SECRET: ${PAYPAL_CLIENT_SECRET}
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    networks:
      - eagems_network
    depends_on:
      - postgres

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/sites:/etc/nginx/sites-enabled
      - ./ssl:/etc/ssl/certs
      - ./static:/var/www/static
    networks:
      - eagems_network
    depends_on:
      - web-server

  backup:
    image: prodrigestivill/postgres-backup-local
    restart: always
    environment:
      POSTGRES_HOST: postgres
      POSTGRES_DB: eagems
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      SCHEDULE: "@daily"
      BACKUP_KEEP_DAYS: 7
      BACKUP_KEEP_WEEKS: 4
      BACKUP_KEEP_MONTHS: 6
    volumes:
      - ./backups:/backups
    networks:
      - eagems_network
    depends_on:
      - postgres

networks:
  eagems_network:
    driver: bridge

volumes:
  postgres_data:
```

---

## 23. Monitoring and Observability

### 23.1 Application Metrics
```rust
use prometheus::{Encoder, TextEncoder, Counter, Histogram, register_counter, register_histogram};
use axum::response::IntoResponse;

lazy_static! {
    static ref HTTP_REQUESTS_TOTAL: Counter = register_counter!(
        "http_requests_total",
        "Total number of HTTP requests"
    ).unwrap();

    static ref HTTP_REQUEST_DURATION: Histogram = register_histogram!(
        "http_request_duration_seconds",
        "HTTP request duration in seconds"
    ).unwrap();

    static ref CART_ADDITIONS: Counter = register_counter!(
        "cart_additions_total",
        "Total number of items added to cart"
    ).unwrap();

    static ref ORDER_COMPLETIONS: Counter = register_counter!(
        "order_completions_total",
        "Total number of completed orders"
    ).unwrap();
}

pub async fn metrics_handler() -> impl IntoResponse {
    let encoder = TextEncoder::new();
    let metric_families = prometheus::gather();
    let mut buffer = vec![];
    encoder.encode(&metric_families, &mut buffer).unwrap();
    String::from_utf8(buffer).unwrap()
}

// Middleware to track metrics
pub async fn track_metrics(
    req: Request,
    next: Next,
) -> Response {
    let start = Instant::now();
    let path = req.uri().path().to_string();

    HTTP_REQUESTS_TOTAL.inc();

    let response = next.run(req).await;

    let duration = start.elapsed().as_secs_f64();
    HTTP_REQUEST_DURATION.observe(duration);

    response
}
```

### 23.2 Structured Logging
```rust
use tracing::{info, warn, error, instrument};
use tracing_subscriber::{
    layer::SubscriberExt,
    util::SubscriberInitExt,
    fmt,
    EnvFilter,
};

pub fn init_tracing() {
    let fmt_layer = fmt::layer()
        .json()
        .with_target(false)
        .with_file(true)
        .with_line_number(true)
        .with_thread_ids(true)
        .with_thread_names(true);

    let filter_layer = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new("info"))
        .unwrap();

    tracing_subscriber::registry()
        .with(filter_layer)
        .with(fmt_layer)
        .init();
}

#[instrument(skip(mm))]
pub async fn create_order(
    ctx: &Ctx,
    mm: &ModelManager,
    order_data: CreateOrderRequest,
) -> Result<Order> {
    info!(user_id = %ctx.user_id(), "Creating new order");

    // Begin transaction
    let mut tx = mm.db().begin().await?;

    // Create order
    let order = match create_order_internal(&mut tx, order_data).await {
        Ok(order) => {
            info!(order_id = %order.id, "Order created successfully");
            order
        }
        Err(e) => {
            error!(error = %e, "Failed to create order");
            tx.rollback().await?;
            return Err(e);
        }
    };

    // Process payment
    match process_payment(&order).await {
        Ok(_) => {
            info!(order_id = %order.id, "Payment processed successfully");
            tx.commit().await?;
        }
        Err(e) => {
            warn!(order_id = %order.id, error = %e, "Payment failed");
            tx.rollback().await?;
            return Err(e);
        }
    }

    Ok(order)
}
```

---

## 24. Final Checklist

### 24.1 Pre-Launch Checklist
- [ ] **Security**
  - [ ] All passwords hashed with Argon2
  - [ ] HTTPS enforced on all routes
  - [ ] CSRF tokens implemented
  - [ ] Rate limiting configured
  - [ ] Security headers set
  - [ ] SQL injection prevention verified
  - [ ] XSS protection tested

- [ ] **Performance**
  - [ ] Database indexes created
  - [ ] Query performance analyzed
  - [ ] Image optimization implemented
  - [ ] CDN configured
  - [ ] Caching strategy deployed
  - [ ] Load testing completed

- [ ] **SEO**
  - [ ] Sitemap.xml generated
  - [ ] Robots.txt configured
  - [ ] Meta tags implemented
  - [ ] Structured data added
  - [ ] 301 redirects from old URLs

- [ ] **Accessibility**
  - [ ] WCAG 2.1 AA compliance verified
  - [ ] Keyboard navigation tested
  - [ ] Screen reader tested
  - [ ] Color contrast verified
  - [ ] Form labels and errors clear

- [ ] **Testing**
  - [ ] Unit tests passing
  - [ ] Integration tests passing
  - [ ] E2E tests passing
  - [ ] Manual testing completed
  - [ ] Cross-browser testing done
  - [ ] Mobile testing completed

- [ ] **Documentation**
  - [ ] API documentation complete
  - [ ] Admin manual written
  - [ ] Deployment guide updated
  - [ ] README files current

- [ ] **Backup & Recovery**
  - [ ] Automated backups configured
  - [ ] Backup restoration tested
  - [ ] Disaster recovery plan documented
  - [ ] Monitoring alerts configured

### 24.2 Post-Launch Tasks
- [ ] Monitor error logs for first 48 hours
- [ ] Review performance metrics
- [ ] Gather user feedback
- [ ] Address any critical issues
- [ ] Plan first update release
- [ ] Document lessons learned

---

## 25. Conclusion

This Product Requirements Document provides a comprehensive roadmap for building the EAGems e-commerce platform using modern Rust web technologies. The architecture leverages:

- **Rust** for type-safe, performant backend development
- **Leptos** for reactive, WASM-powered frontend
- **PostgreSQL** for robust data persistence
- **Tailwind CSS** for responsive, accessible design
- **Playwright** for comprehensive E2E testing

The phased implementation approach ensures steady progress while maintaining quality and allowing for feedback integration at each milestone.

### Key Success Factors:
1. **Performance First** - Optimize from the start
2. **Mobile First** - Design for mobile, enhance for desktop
3. **Security by Design** - Build security into every component
4. **Test Driven** - Comprehensive testing at all levels
5. **User Focused** - Prioritize user experience and accessibility

### Next Steps:
1. Review and approve this PRD
2. Set up development environment
3. Begin Phase 1 implementation
4. Establish regular review cycles
5. Maintain open communication channels

---

*This document serves as the living blueprint for the EAGems project and should be updated as requirements evolve and implementation progresses.*

## Document Appendix

### A. Glossary of Terms
- **BMC**: Business Model Controller
- **CRUD**: Create, Read, Update, Delete
- **E2E**: End-to-End
- **PWA**: Progressive Web Application
- **RBAC**: Role-Based Access Control
- **RPC**: Remote Procedure Call
- **SPA**: Single Page Application
- **SSR**: Server-Side Rendering
- **WASM**: WebAssembly
- **WCAG**: Web Content Accessibility Guidelines

### B. References
- [Rust Book](https://doc.rust-lang.org/book/)
- [Leptos Documentation](https://book.leptos.dev/)
- [Axum Documentation](https://docs.rs/axum/latest/axum/)
- [SQLx Documentation](https://docs.rs/sqlx/latest/sqlx/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

### C. Contact Information
- **Project Lead**: [To be assigned]
- **Technical Lead**: [To be assigned]
- **QA Lead**: [To be assigned]
- **DevOps Lead**: [To be assigned]

---

**END OF DOCUMENT**

*Version 1.0.0 - Generated 2024-12-28*
*Total Pages: Comprehensive Technical Specification*
*Status: Ready for Review and Implementation*
