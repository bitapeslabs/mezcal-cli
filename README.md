# dunes-cli

The **dunes-cli** is an interactive command‑line tool for managing your HD wallet and interacting with Dune assets. It supports wallet generation, recovery, switching addresses, querying balances, transferring funds, minting and etching Dune tokens, configuration management, and more.

## Installation

1. **Build the Project**  
   Build with esbuild:

   ```sh
   npm run build
   ```

   or build the packaged executable:

   ```sh
   npm run buildpkg-windows
   npm run buildpkg-linux
   ```

2. **Run the CLI**  
   After building, run:
   ```sh
   npm run start
   ```
   or
   ```sh
   node dist/index.js
   ```

## Command Reference

The CLI command is invoked as `dunes`. Below are the available commands along with usage examples:

### Wallet Commands

- **Generate a New Address**

  - Generates a new wallet address (or switches to the next index if a wallet already exists).
  - **Usage:**
    ```sh
    dunes wallet generate
    ```
  - Example output shows the new wallet index and address.

- **Recover a Wallet**

  - Recovers a wallet from a 12‑word mnemonic phrase.
  - **Usage:**
    ```sh
    dunes wallet recover
    ```
  - Follow the prompts to enter your mnemonic phrase and set a password.

- **Reveal Mnemonic**
  - Displays the mnemonic phrase for your active wallet.
  - **Usage:**
    ```sh
    dunes wallet reveal
    ```
- **Show Wallet Info**
  - Displays the current wallet address.
  - **Usage:**
    ```sh
    dunes wallet info
    ```
- **Switch Wallet**
  - Switches to another HD wallet index.
  - **Usage:**
    ```sh
    dunes wallet switch <index>
    ```
  - Example:
    ```sh
    dunes wallet switch 2
    ```
- **List Wallets**
  - Lists all generated wallet addresses and their balances.
  - **Usage:**
    ```sh
    dunes wallets
    ```

### Balance & Transfer Commands

- **Balance**

  - Display confirmed BTC and Dune balances for your wallet address.
  - **Usage:**
    ```sh
    dunes balance
    ```

- **Transfer**
  - Interactively build and broadcast BTC and/or Dune transfers.
  - **Usage:**
    ```sh
    dunes transfer
    ```
  - Follow the interactive prompts to enter transfer details.

### Dune Asset Commands

- **Dune Info**

  - Shows metadata and the top holders for a Dune asset.
  - **Usage:**
    ```sh
    dunes info <block:tx | duneName>
    ```
  - Example:
    ```sh
    dunes info 859:1
    ```

- **Holders**

  - Lists holders for a specific Dune asset.
  - **Usage:**
    ```sh
    dunes holders <block:tx | duneName> [page]
    ```
  - Example:
    ```sh
    dunes holders 859:1 3
    ```

- **Mint**

  - Mint a Dune token that you have already etched (if mintable).
  - **Usage:**
    ```sh
    dunes mint <block:tx | duneName>
    ```
  - Follows prompts for mint cost and confirmation.

- **Etch**
  - Create a Dunestone etching and build a transaction.
  - **Usage:**
    ```sh
    dunes etch
    ```
  - A guided wizard walks you through setting etching properties.

### Configuration Commands

- **Set Configuration**

  - Set Electrum API URL, Dunes RPC URL, or Network (bitcoin | testnet | regtest).
  - **Usage:**
    ```sh
    dunes config set --electrum <url> --dunes <url> --network <env>
    ```
  - Example:
    ```sh
    dunes config set --electrum https://regtest.anoa.io/api --network regtest
    ```

- **Show Configuration**
  - Display the current Dunes CLI configuration.
  - **Usage:**
    ```sh
    dunes config show
    ```
  - You may also run:
    ```sh
    dunes config
    ```

## Additional Notes

- **Error Handling:**  
  Errors are reported with clear messages. For example, if there’s a decryption failure or invalid input, the CLI will output an error and exit.

- **Interactive Prompts:**  
  Commands such as `wallet recover`, `transfer`, and `etch` use interactive prompts (powered by Inquirer) to guide you step‑by‑step.

- **Build & Packaging:**  
  The project uses [esbuild](https://esbuild.github.io) for bundling and supports creating standalone executables for Windows and Linux.

For more details or to report issues, please visit the [GitHub Issue Tracker](https://github.com/bitapeslabs/dunes-cli/issues).

## Happy transacting with dunes-cli!

Enjoy using **dunes-cli**!
