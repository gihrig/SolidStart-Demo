# gen-key

  gen-key is a defensive security tool used to generate secure keys for encryption, authentication, or other cryptographic operations in the web application.

  ## usage:
  ```sh
  cargo run -p gen-key
  ```

  ## Purpose:
  Generates a 512-bit (64-byte) random cryptographic key for security purposes.

  ## Functionality:
  - Generates a 64-byte random key using rand::rng() (main.rs:8-9)
  - Prints the raw key bytes in debug format (main.rs:10)
  - Encodes the key using base64url encoding via lib_utils::b64::b64u_encode (main.rs:12)
  - Outputs the base64url-encoded key (main.rs:13)

  ## Dependencies:
  - lib-utils - Internal crate for utility functions like base64url encoding
  - rand - External crate for cryptographically secure random number generation
