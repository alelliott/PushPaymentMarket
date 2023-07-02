## Ownable Push-Payment Marketplace Contract - PushPaymentMarket.sol
A generic push-payment marketplace where registered vendors can receive customer payments in ETH or whitelisted ERC-20s. The contract owner can define a fee in basis points charged on each purchase and a receipient address to receive them.

### Compile
`npx hardhat compile`

### Test
`npx hardhat test`

### Deploy to Local Hardhat Node
1. Start a development node locally     
`npx hardhat node`
2. In separate terminal, deploy contract    
`npx hardhat run --network localhost scripts/deploy.ts`
