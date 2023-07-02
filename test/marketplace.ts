import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, Signer, parseEther, parseUnits } from "ethers";


describe("PushPaymentMarket", function () {
  let PushPaymentMarket: Contract;
  let owner: Signer;
  let addr1: Signer;
  let addr2: Signer;
  let ownerAddress: string;
  let addr1Address: string;
  let addr2Address: string;
  let feeBasisPoints = 100; // 1%

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    addr1Address = await addr1.getAddress();
    addr2Address = await addr2.getAddress();

    const PushPaymentMarketFactory = await ethers.getContractFactory("PushPaymentMarket");
    PushPaymentMarket = await PushPaymentMarketFactory.deploy(feeBasisPoints, ownerAddress);
    await PushPaymentMarket.waitForDeployment();
  });

  it("Should deploy with the correct owner, fee, and fee recipient", async function () {
    expect(await PushPaymentMarket.owner()).to.equal(ownerAddress);
    expect(await PushPaymentMarket.feeRecipient()).to.equal(ownerAddress);
    expect(await PushPaymentMarket.feeBasisPoints()).to.equal(feeBasisPoints);
  });

  it("Should allow the owner to update fee basis points and recipient, but not non-owners", async function () {
    // As owner
    await PushPaymentMarket.connect(owner).updateFeeBasisPoints(200);
    expect(await PushPaymentMarket.feeBasisPoints()).to.equal(200);

    await PushPaymentMarket.connect(owner).updateFeeRecipient(addr1Address);
    expect(await PushPaymentMarket.feeRecipient()).to.equal(addr1Address);

    // As non-owner
    await expect(
      PushPaymentMarket.connect(addr1).updateFeeBasisPoints(200)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      PushPaymentMarket.connect(addr1).updateFeeRecipient(addr2Address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Should allow the owner to add and remove whitelisted tokens, but not non-owners", async function () {
    const USDCAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

    // As owner
    await PushPaymentMarket.connect(owner).addToWhitelist(USDCAddress);
    expect(await PushPaymentMarket.whitelistedTokens(USDCAddress)).to.equal(true);

    await PushPaymentMarket.connect(owner).removeFromWhitelist(USDCAddress);
    expect(await PushPaymentMarket.whitelistedTokens(USDCAddress)).to.equal(false);

    // As non-owner
    await expect(
      PushPaymentMarket.connect(addr1).addToWhitelist(USDCAddress)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      PushPaymentMarket.connect(addr1).removeFromWhitelist(USDCAddress)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Should allow the owner to register and update vendors, but not non-owners", async function () {
    const vendorId = 1;
    const vendorAddress = addr1Address;
    const vendorAddress2 = ethers.Wallet.createRandom().address;

    // As owner
    await expect(
      PushPaymentMarket.connect(owner).registerVendor(vendorId, vendorAddress)
    )
      .to.emit(PushPaymentMarket, "VendorRegistered")
      .withArgs(vendorId, vendorAddress);
    expect(await PushPaymentMarket.vendors(vendorId)).to.equal(vendorAddress);

    await expect(
      PushPaymentMarket.connect(owner).updateVendorAddress(vendorId, vendorAddress2)
    ).to.not.be.reverted;
    expect(await PushPaymentMarket.vendors(vendorId)).to.equal(vendorAddress2);

    // As non-owner
    await expect(
      PushPaymentMarket.connect(addr1).registerVendor(2, vendorAddress)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      PushPaymentMarket.connect(addr1).updateVendorAddress(vendorId, vendorAddress)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Should allow purchases with ERC20 token", async function () {
    const vendorId = 1;
    const orderId = 1;
    const vendorAddress = addr1Address;
    const customer = addr2;
    const customerAddress = addr2Address;
    const purchaseAmount = parseUnits("10", 6);
    const fee = (purchaseAmount * BigInt(feeBasisPoints)) / BigInt(10000);
    const amountAfterFee = purchaseAmount - BigInt(fee);

    // Register a vendor, addr1
    await PushPaymentMarket.connect(owner).registerVendor(vendorId, vendorAddress);
    expect(await PushPaymentMarket.vendors(vendorId)).to.equal(vendorAddress);

    // Deploy a mock ERC20 token to a customer
    const ERC20Factory = await ethers.getContractFactory("MockERC20");
    const TUSD = await ERC20Factory.connect(customer).deploy("TUSD", "TUSD");
    const initialCustomerBalance = await TUSD.balanceOf(customerAddress);
    const initialOwnerBalance = await TUSD.balanceOf(ownerAddress);

    // Add the mock token to the PushPaymentMarket whitelist
    await PushPaymentMarket.connect(owner).addToWhitelist(TUSD.target);
    expect(await PushPaymentMarket.whitelistedTokens(TUSD.target)).to.equal(true);

    // Approve token
    await TUSD.connect(customer).approve(PushPaymentMarket.target, purchaseAmount);

    // Purchase with ERC20
    await expect(
      PushPaymentMarket.connect(customer).purchaseWithERC20(
        vendorId,
        orderId,
        purchaseAmount,
        TUSD.target
      )
    )
      .to.emit(PushPaymentMarket, "Purchase")
      .withArgs(
        customerAddress,
        vendorId,
        orderId,
        amountAfterFee,
        TUSD.target
      );

    // Verify balances
    expect(await TUSD.balanceOf(vendorAddress)).to.equal(amountAfterFee);
    expect(await TUSD.balanceOf(ownerAddress)).to.equal(
      initialOwnerBalance + fee
    );
    expect(await TUSD.balanceOf(customerAddress)).to.equal(
      initialCustomerBalance - purchaseAmount
    );
  });

  it("Should allow purchases with Ether", async function () {
    const vendorId = 1;
    const vendorAddress = addr1Address;
    const customer = addr2;
    const customerAddress = addr2Address;
    const purchaseAmount = parseEther("1");
    const fee = (purchaseAmount * BigInt(feeBasisPoints)) / BigInt(10000);
    const amountAfterFee = purchaseAmount - fee;
    const orderId = 1;

    // Register a vendor, addr1
    await PushPaymentMarket.connect(owner).registerVendor(vendorId, vendorAddress);
    expect(await PushPaymentMarket.vendors(vendorId)).to.equal(vendorAddress);

    const initialOwnerBalance = await ethers.provider.getBalance(ownerAddress);
    const initialVendorBalance = await ethers.provider.getBalance(vendorAddress);

    // Purchase
    await expect(
      PushPaymentMarket.connect(customer).purchaseWithEther(vendorId, orderId, {
        value: purchaseAmount,
      })
    )
      .to.emit(PushPaymentMarket, "Purchase")
      .withArgs(
        customerAddress,
        vendorId,
        orderId,
        amountAfterFee,
        "0x0000000000000000000000000000000000000000"
      );

    // Verify balances
    expect(await ethers.provider.getBalance(vendorAddress)).to.equal(
      initialVendorBalance + amountAfterFee
    );
    expect(await ethers.provider.getBalance(ownerAddress)).to.equal(
      initialOwnerBalance + fee
    );
  });

  it("Should allow the owner to pause and unpause the contract, but not non-owners", async function () {
    // Register a vendor, addr1
    const vendorId = 1;
    const vendorAddress = addr1Address;
    const purchaseAmount = parseEther("1");
    const orderId = 1;

    await PushPaymentMarket.connect(owner).registerVendor(vendorId, vendorAddress);
    expect(await PushPaymentMarket.vendors(vendorId)).to.equal(vendorAddress);

    // As owner
    await PushPaymentMarket.connect(owner).pause();
    expect(await PushPaymentMarket.paused()).to.equal(true);

    await expect(
      PushPaymentMarket.connect(addr2).purchaseWithEther(vendorId, orderId, {
        value: purchaseAmount,
      })
    ).to.be.revertedWith("Pausable: paused");

    await PushPaymentMarket.connect(owner).unpause();
    expect(await PushPaymentMarket.paused()).to.equal(false);

    // As non-owner
    await expect(PushPaymentMarket.connect(addr1).pause()).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
    await expect(PushPaymentMarket.connect(addr1).unpause()).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it('Should transfer ownership correctly', async function () {
    const originalOwner = owner;
    const newOwner = addr1;
    const newOwnerAddress = addr1Address;
    expect(await PushPaymentMarket.owner()).to.equal(ownerAddress);

    await PushPaymentMarket.connect(owner).transferOwnership(newOwnerAddress);
    expect(await PushPaymentMarket.owner()).to.equal(newOwnerAddress);
  });
  
  it("Should reject ERC20 purchases with 0 amount", async function () {
    const vendorId = 1;
    const orderId = 1;
    const vendorAddress = addr1Address;
    const customer = addr2;
    const customerAddress = addr2Address;
    const purchaseAmount = parseUnits("0", 6);
  
    // Register a vendor, addr1
    await PushPaymentMarket.connect(owner).registerVendor(vendorId, vendorAddress);
    expect(await PushPaymentMarket.vendors(vendorId)).to.equal(vendorAddress);
  
    // Deploy a mock ERC20 token to a customer
    const ERC20Factory = await ethers.getContractFactory("MockERC20");
    const TUSD = await ERC20Factory.connect(customer).deploy("TUSD", "TUSD");
  
    // Add the mock token to the PushPaymentMarket whitelist
    await PushPaymentMarket.connect(owner).addToWhitelist(TUSD.target);
    expect(await PushPaymentMarket.whitelistedTokens(TUSD.target)).to.equal(true);
  
    // Approve token
    await TUSD.connect(customer).approve(PushPaymentMarket.target, purchaseAmount);
  
    // Attempt purchase with ERC20 with 0 amount
    await expect(
      PushPaymentMarket.connect(customer).purchaseWithERC20(
        vendorId,
        orderId,
        purchaseAmount,
        TUSD.target
      )
    ).to.be.revertedWith("Amount must be greater than zero");
  });
  
  it("Should reject Ether purchases with 0 amount", async function () {
    const vendorId = 1;
    const vendorAddress = addr1Address;
    const customer = addr2;
    const customerAddress = addr2Address;
    const purchaseAmount = parseEther("0");
    const orderId = 1;
  
    // Register a vendor, addr1
    await PushPaymentMarket.connect(owner).registerVendor(vendorId, vendorAddress);
    expect(await PushPaymentMarket.vendors(vendorId)).to.equal(vendorAddress);
  
    // Attempt Ether purchase with 0 amount
    await expect(
      PushPaymentMarket.connect(customer).purchaseWithEther(vendorId, orderId, {
        value: purchaseAmount,
      })
    ).to.be.revertedWith("Amount must be greater than zero");
  });

});
