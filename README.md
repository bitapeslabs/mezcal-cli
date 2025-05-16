# mezcal-cli

The **mezcal-cli** is an interactive command‑line tool for managing a bitcoin mezcal wallet and interacting with Mezcal assets. It supports wallet generation, recovery, switching addresses, querying balances, transferring funds, minting and etching Mezcal tokens, configuration management, and more.

## 🚀 Installation

1. Install [Node.js](https://nodejs.org/) (v18 or higher).
2. On your command line terminal, run:

   ```sh
   npm install -g mezcal-cli
   ```

3. Youre all set! You can now use the `mezcal` command in your terminal. To view the commands you can call, run

   ```sh
   mezcal --help
   ```

## 📚 Command Reference

The CLI command is invoked as `mezcal`. Below are the available commands along with usage examples:

### Wallet Commands

- **Generate a New Address**

  - Generates a new wallet address (or switches to the next index if a wallet already exists).
  - **Usage:**
    ```sh
    mezcal wallet generate
    ```
  - Example output shows the new wallet index and address.

- **Recover a Wallet**

  - Recovers a wallet from a 12‑word mnemonic phrase.
  - **Usage:**
    ```sh
    mezcal wallet recover
    ```
  - Follow the prompts to enter your mnemonic phrase and set a password.

- **Reveal Mnemonic**
  - Displays the mnemonic phrase for your active wallet.
  - **Usage:**
    ```sh
    mezcal wallet reveal
    ```
- **Show Wallet Info**
  - Displays the current wallet address.
  - **Usage:**
    ```sh
    mezcal wallet info
    ```
- **Switch Wallet**
  - Switches to another HD wallet index.
  - **Usage:**
    ```sh
    mezcal wallet switch <index>
    ```
  - Example:
    ```sh
    mezcal wallet switch 2
    ```
- **List Wallets**
  - Lists all generated wallet addresses and their balances.
  - **Usage:**
    ```sh
    mezcal wallets
    ```

### Balance & Transfer Commands

- **Balance**

  - Display confirmed BTC and Mezcal balances for your wallet address.
  - **Usage:**
    ```sh
    mezcal balance
    ```

- **Transfer**
  - Interactively build and broadcast BTC and/or Mezcal transfers.
  - **Usage:**
    ```sh
    mezcal transfer
    ```
  - Follow the interactive prompts to enter transfer details.

### Mezcal Asset Commands

- **Mezcal Info**

  - Shows metadata and the top holders for a Mezcal asset.
  - **Usage:**
    ```sh
    mezcal info <block:tx | mezcalName>
    ```
  - Example:
    ```sh
    mezcal info 859:1
    ```

**= Discover mezcal =**

- **Mezcal List**

  - Lists all Mezcals on the network.
  - **Usage:**
    ```sh
    mezcal all <protocol>
    ```

- **Holders**

  - Lists holders for a specific Mezcal asset.
  - **Usage:**
    ```sh
    mezcal holders <block:tx | mezcalName> [page]
    ```
  - Example:
    ```sh
    mezcal holders 859:1 3
    ```

- **Mint**

  - Mint a Mezcal token that you have already etched (if mintable).
  - **Usage:**
    ```sh
    mezcal mint <block:tx | mezcalName>
    ```
  - Follows prompts for mint cost and confirmation.

- **Etch**
  - Create a Mezcalstone etching and build a transaction.
  - **Usage:**
    ```sh
    mezcal etch
    ```
  - A guided wizard walks you through setting etching properties.

### Configuration Commands

- **Set Configuration**

  - Set Electrum API URL, Mezcals RPC URL, or Network (bitcoin | testnet | regtest).
  - **Usage:**
    ```sh
    mezcal config set --electrum <url> --mezcal <url> --network <env>
    ```
  - Example:
    ```sh
    mezcal config set --electrum https://regtest.anoa.io/api --network regtest
    ```

- **Show Configuration**
  - Display the current Mezcals CLI configuration.
  - **Usage:**
    ```sh
    mezcal config show
    ```
  - You may also run:
    ```sh
    mezcal config
    ```

For more details or to report issues, please visit the [GitHub Issue Tracker](https://github.com/bitapeslabs/mezcal-cli/issues).
