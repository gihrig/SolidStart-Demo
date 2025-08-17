# EAGems Web Project Roadmap

An outline of all major steps required to complete the project, divided into four phases.
Plus a phase for optional features - cost to be determined.

- **Phase One - This document**

  Complete project roadmap and get Rhonda's agreement on scope of work

- **Phase One complete No charge**
----
- **Phase Two - Foundation start: \$165**

  Complete **Back-End API Server** section to support catalog pages

  Complete **Front-End UI Server** section to support home and catalog page

  Home page with minimal style

  One Catalog page with minimal style

  Install project on development domain https://eagems.arkadias.net

- **Phase Two complete \$167.50**
----
- **Phase Three - Basic Features start: \$167.50**

  Re-create all Existing pages in the new project

  Responsive Style Update completed for current pages

  Create all existing functions (except RSS Feed)  in new project

  Create Admin pages to support Catalog maintenance

  New project moved to production

- **Phase Three complete \$167.50**
----
- **Phase Four - New Features start: \$167.50**

  **Price Change** Allow temporary price change e.g. discount

  **Custom Shopping Cart** Fully functional with PayPal checkout

  **Discount Codes** Allow creation and management of discount codes

- **Phase Four complete: \$165**

Total \$1000

- **Phase Five - Optional**

  **Payment processor** to support direct credit card checkout

  **Custom Search** to replace existing third party service

  **RSS Feed Generation** Duplicate existing feature

Creation and Cost per feature to be determined

----

# Primary Goals:

In general, the existing site will be recreated with up to date technology.

- Pages will be created in Svelte, Tailwind CSS and Rust.
- The existing site provides content and most detail.
- What is documented here are changes from the existing.

## Existing features to recreate

- Left menu generation
- Catalog item inheritance
- RSS Feed generation (on hold)

## New features outline
- See detail at Phase **Four**

## Style Update

    - Scale header image to match screen size
    - Hide top menu behind disclosure button on smaller screen sizes
    - Hide left menu (contents) behind disclosure button on smaller screen sizes
    - Home page images
      Consider organizing into 6, 4, 2 or 1 across depending on screen and image size
      Enlarge?
      Add caption, border, other - discuss w/ Rhonda
    - Catalog listing pages - reorganize for smaller screens
    - Image slide show - Make responsive, swipe to change image on mobile devices
    - Modernize general page style
       - Different, larger font, soften contrast
       - Update page borders and background

## Price Change

    - Create 'discounted price' feature where original price is shown with strike through
      and discounted price is shown in red? Bold? (Red for now - may change thought when time.)

## Custom Shopping Cart

    Required for:
      Checkout with more than one payment processor (e.g. PayPal and Stripe)
      Discount coupon
        - Percentage discount
        - Time limited discount
        - One-time limited discount
        - Cost, weight or quantity based shipping cost

    Checkout with PayPal
    Checkout with Stripe (optional decide after site is up)
    Discount code management
      - Automatic creation of one-time discount code on warranty registration
      - Manual creation and expiration of discount codes
        - One-time use
        - Time limited
        - Valid until manually revoked

## Search

    Conditional - Not sure how/if this would be done/cost
    - Today Swiftype "Site Search" costs $79/mo! (Current no-cost search is grandfathered.)
    - Create duplicate of Swiftype "App Search".
      - See [SwifType Demo](https://swiftype.com/search-ui) scroll down
        a page for a functioning demo
        - try typing things like "red", "yellow"
        - Conditional: evaluate creation of a similar search experience
        after the site is up.

# Component Detail

## Git Commit Message Format

    The automated versioning, build and deploy system used on this
    project requires git commit messages to be formatted as
    _Conventional Commits v1.0.0_ which describe features, fixes,
    and breaking changes made in commit messages.

      The commit message should be structured as follows:

        type(optional scope): description

        optional body

        optional footer(s)

      The commit message contains the following types,
      to communicate the intent of the committed code:

        - fix: patches a bug.

        - feat: introduces a new feature.

        - BREAKING CHANGE: in a footer or ! after the type, introduces a breaking change.

        types other than fix: and feat: are allowed, for example
          build:, chore:, ci:, docs:, style:, refactor:, perf:, test:, and others.

        footers other than BREAKING CHANGE: description may be provided.

        A scope (the code affected by this commit) should be added to a commit
        type to provide additional information within parenthesis, e.g.,

          feat(parser): add ability to parse email

          - BRAKING CHANGE Parser is not compatible with old server

      See [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
      for details and examples.

## File & Variable naming

    The general rule is:
    1. Avoid multi-word names where practical, otherwise use dashes
       unless that breaks something.
    2. Dash separated multi-word-url-names assist users in finding the web site.
    3. Underscore separated variable names are required by Javascript and Rust
       variables, modules and file names.

----

# Phase Two

## Summary

    Complete Back-End API Server section to support catalog pages
    Complete Front-End UI Server section Home and Catalog pages
    Create Home page using minimal styles
    Create One Catalog page served from Data Base with minimal styles
----

### Back-End API server

    Done - Host on Namecheap VPS
    Done - Configure Virtualmin (Web, email, webmail, server management)
    Done - Configure support for free SSL certificate
    Done - Configure port 80 to 443 redirect (use secure connection)
    Done - Configure firewall (restrict sensitive ports to whitelisted IP)
    Done - Configure project on development domain (eagems.arkadias.net)
    Done - Configure development project to support UI and API servers
    Done - Build and test UI server
    Done - Build and test API Server
    Done - Test Application
    Done - Configure basic CI/CD (Continuous Integration/Continuous Deployment)
    Done - Build Application release and Deploy - Needs improvement see Future

### Database - PostgreSQL

    Done - Install PostgreSQL database latest version
    Done - Establish ssh access from development machine

### Back-End API web-server

    Done - Install and configure Back-End API server
    Done - Configure sqlx for PostgreSQL
      Done - Establish test isolation
      Done - Establish .env based configuration
      Done - Connect App to database
    Done - Create EAGems catalog tables
      Notes:
        Field changes compared to PHP text data:
          `item_id` limited to 128 characters (must be unique)
          `item_name` limited to 1024 characters
          `title` limited to 1024 characters
          `description` limited to 2048 characters
          `price limited to 9999.99
          `sale_price added, limited to 9999.99
          `shippingAmt` limited to 999.99
          `shippingAddr` removed, never used
          `rssTitle` limited to 1024 characters
          `rssDescription` limited to 2048 characters

### Back-End API 'business logic'

    Create CRUD functions for `catalog` and `catalog_item` and API
      endpoints for these (CRUD = Create, Read, Update, Delete)

      Done - Create catalog #[post("/api/catalog/create")]
      Done - Read all catalogs #[get("/api/catalog/read/all")]
      Done - Read one catalog and items #[get("/api/catalog/read/{id}")]
      Done - Update catalog #[put("/api/catalog/update/{id}")]
      Done - Catalog add item #[put("/api/catalog/add-item/{catalog_id}/{catalog_item_id}")]
      Done - Catalog remove item #[delete("/api/catalog/remove-item/{catalog_id}/{catalog_item_id}")]
      Done - Delete catalog #[delete("/api/catalog/delete/{id}")]

      Done - Create catalog_item #[post("/api/catalog-item/create")]
      Done - Read all catalog_items #[get("/api/catalog-item/read/all")]
      Done - Read one catalog_item #[get("/api/catalog-item/read/{id}")]
      Done - Update catalog_item #[put("/api/catalog-item/update/{id}")]
      Done - Delete catalog_item #[delete("/api/catalog-item/delete/{id}")]

### Front-End UI Server

    Done - Install and configure Font-End web server
    Done - Convert home page to new tech stack, minimal style
    Done - Create Front-End 'business logic' to serve catalog page
    Done - Create code to display various page types
      Notes:
        These pages will largely duplicate the style of existing pages
        Minor style updates will be applied e.g. border, background texture,
        font and color, etc. Details to be worked out as work progresses
      Done - Page layout
        Includes
          - Header image
          - Top menu
          - Left menu (placeholder only)
          - Footer
      Done - Main page
        Functioning with minimal style changes
      Done - Catalog pages
        Functioning with minimal style changes
        Create Front-End UI communication from local JSON file
        Manually entered Data will be read from local JSON file

      Done - Rework server to support Svelte-Kit and PostgreSQL database

----

# Phase Three

## Summary

    Remaining Style Update items completed for all pages
    Complete "under the hood" code to support existing functions
    Install completed project on production domain
    Migrate edwardallengems.com domain and email from cPanel server
    Close cPanel account
----

## Back-End API server

  Build Docker Container

  - cd api && cargo sqlx prepare -- --bin eagems_api && cd ..

  - docker build --file api/Dockerfile --tag eagems_api:dev .
  -
  - docker build -t registry.gitlab.com/arkadia-systems/eagems .
  - docker push registry.gitlab.com/arkadia-systems/eagems

  Custom Back-End API 'business logic'

  - Account creation and deletion
  - Login/logout for admin functions
  - Contents (left menu) automated creation
  - Image upload is manual by FTP
  - Contact and warranty form support
      Conditional (Rhonda)
        Send via email or login to app for contact info?
        (I think I will need more data on what this means
        when time comes)

## Front-End UI Server

  Build Docker Container

  - docker build --file ui/Dockerfile --tag eagems_ui:dev .

  Complete code to enable functions now in production

  - Catalog database admin CRUD from UI support
  - Catalog generation from database
  - Catalog/item default style + updatable at child level
  - Catalog item inheritance
  - Generated site-map
  - Left Menu Generation
  - Contact Us form (email or admin panel?)
  - Warranty Registration form
  - Create code to display various page types
      - Pages will be 'responsive' to screen sizes from mobile to desktop
  - Catalog pages
      - Use existing PayPal buttons for Add/View Cart
      - Gallery display pages two up - e.g Awesome Rocks
          http://edwardallengems.com/WowRocks.php
          (do 'two up' and 'four up' mean how many pics show?
          I'm open to that growing to more if/when possible if that's what that means)
          [They all show. Number across varies with screen width]
  - Gallery display pages four up
        e.g Index to display specimens [display-index.php]
        (http://edwardallengems.com/display-index.php)
  - Text content pages e.g.
      [shipping.php](http://edwardallengems.com/shipping.php)
        Includes
          - Store policies
          - About Us
          - Contact Us
          - Links
          - Search
          - etc.
  -  Press_releases looks abandoned, still needed? (Rhonda)
      [press_releases.php](http://edwardallengems.com/press_releases.php)
      Doing a lot less Press releases and have forgotten to add those I've done.
      Probably prefer to keep and get up-to-date.
  -  Contact form
      Send via email as current
  -  Warranty registration form
      Send via MailChimp as current

## Prepare site for production

    Build redirect list - Old URLs to new version
    Rework build system to support efficient workflow
    Fix outstanding bugs See: Known Issues
    Transfer existing data to new system
    Provide training and support to get new system into production
    Migrate edwardallengems.com domain and email from cPanel domain
    Close cPanel account

----

# Phase Four

## Summary

    Add new features (in this prosed sequence) and put into
    production as each is completed:
----

    Price Change
    Custom Shopping Cart
      Custom shopping cart
      Accepts items from catalog page buttons
      Has standard Qty +- and delete buttons
      Forward to checkout
      Checkout
      Shipping service (UPS, Priority, etc)
      Calculate shipping (Rhonda formula?)
      Apply and validate coupon code
      Payment processing
        PayPal
        Stripe (Rhonda - optional, decide after site is up)
    Search
    Image upload
        Upload single main image, auto-generate thumbnail images
        RSS feed support - can be (semi)automated?  (yes!)
          Conditional
            RSS preview before publishing?  (yes, preferred)
    Promo banner
    RSS Feed support
      Provide interface for preview, editing and publishing of feed

----

## Project Completion

    Confirm completion of project in development domain
    Upgrade to larger server
    Establish comprehensive server backup
    enable server antivirus scanning
      Webmin > System > Bootup and Shutdown > clamav-daemon
    Configure mail server (Reject criminal spam)
    Research migrating email from existing system
        (Virtualmin can import from cPanel)
    Migrate email from existing server
        (would be great to clean up existing mail before migration)
    Move authoritative DNS to new production server
    Migrate web project to production server/domain
    Setup URL redirects from *.php page to new pages
      Virtualmin > {domain} > Services > Configure Nginx Website > URL Re-writing
    Move edwardallengems.com domain to production server
    Update robots.txt

## Known Issues
    BUG: http > https redirect is non-functional
    BUG: SSR does not return styles
    BUG: Loss of style on 500 error, others?
    BUG: link.json returns 500 on not found or empty > 400
    BUG: Cypress fails with `500 /blog` on prod build
    see: https://github.com/sveltejs/kit/issues/19#issuecomment-738940910

## Future

    Implement comprehensive application logging
    Tune service-worker for realtime content update
      See: https://sapper.svelte.dev/docs#src_service-worker_js
    Setup app specific ports via .env file
    Move all project-specific names and data to .env file
      Minimize number of Github Secrets e.g. owner repo > GITHUB_REPOSITORY
      (owner/repo), APP_API_KEY > secrets.GITHUB_TOKEN, etc.
    Organize project into distinct static, ui_server
      and api_server folders
    Refactor CI/CD workflow to be project agnostic.
      See: https://docs.github.com/en/free-pro-team@latest/actions/reference/
      environment-variables#default-environment-variables
    Refactor CI/CD for better efficiency
      See: https://github.com/zladovan/monorepo
      Automate cargo.toml version update
    Get server-api cargo make test_server working on Github
    Hardening for domain email
      Ensure PTR record is correct
      Check DNS configurations with https://mxtoolbox.com/SuperTool.aspx
    SEO
      Generate sitemap.xml
    Security
      Flag app executables 770 or 750
      Set .env log levels to error
      Consider implementing transport compression (NATS, MessagePack)
      Consider implementing u2f/FIDO/Oauth security
      Consider implementing encrypted data at rest/in app
    Performance
      Evaluate DB response time against traffic/load
      Consider implementing sqlx_core::postgres::PgPoolOptions
      Trim tokio size, implement needed features in place of "full"
      Consider Replacing REST API with Rust<>WASM<>JS data flow
        Re: https://github.com/happybeing/svelte-wasi-with-rust
    Accessibility
      What is needed here?
