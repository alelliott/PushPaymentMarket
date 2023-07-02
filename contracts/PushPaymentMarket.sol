// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";


contract PushPaymentMarket is Ownable, Pausable, ReentrancyGuard {

    // Marketplace Fee Recipient and Amount in Basis Points
    address payable public feeRecipient;
    uint256 public feeBasisPoints;

    // Map vendor IDs to their payment addresses
    mapping(uint256 => address payable) public vendors;

    // Whitelist for approved purchase tokens
    mapping(address => bool) public whitelistedTokens;

    // Event when a purchase is made
    event Purchase(
        address indexed buyer,
        uint256 indexed vendorId,
        uint256 indexed orderId,
        uint256 amount,
        address token
    );

    // Event when a vendor is registered
    event VendorRegistered(
        uint256 indexed vendorId,
        address indexed vendorAddress
    );

    // Contract deployment
    constructor(uint256 _feeBasisPoints, address payable _feeRecipient) {
        feeBasisPoints = _feeBasisPoints;
        feeRecipient = _feeRecipient;
    }

    // Function to add a token to the whitelist
    function addToWhitelist(address _token) public onlyOwner {
        whitelistedTokens[_token] = true;
    }

    // Function to remove a token from the whitelist
    function removeFromWhitelist(address _token) public onlyOwner {
        whitelistedTokens[_token] = false;
    }

    // Register a vendor's payment address
    function registerVendor(uint256 _vendorId, address payable _vendorAddress) public onlyOwner {
        require(_vendorAddress != address(0), "Vendor address cannot be the zero address");
        require(vendors[_vendorId] == address(0), "Vendor ID is already registered");

        vendors[_vendorId] = _vendorAddress;

        emit VendorRegistered(_vendorId, _vendorAddress);
    }

    // Update a vendor's payment address
    function updateVendorAddress(uint256 _vendorId, address payable _newVendorAddress) public onlyOwner {
        require(_newVendorAddress != address(0), "New vendor address cannot be the zero address");
        require(vendors[_vendorId] != address(0), "Vendor ID is not registered");

        vendors[_vendorId] = _newVendorAddress;
    }

    // Update the marketplace fee basis points
    function updateFeeBasisPoints(uint256 _newFeeBasisPoints) public onlyOwner {
        feeBasisPoints = _newFeeBasisPoints;
    }

    // Update the marketplace fee recipient
    function updateFeeRecipient(address payable _newFeeRecipient) public onlyOwner {
        feeRecipient = _newFeeRecipient;
    }

    function purchaseWithERC20(uint256 _vendorId, uint256 _orderId, uint256 _amount, address _token) public nonReentrant whenNotPaused {
        require(whitelistedTokens[_token], "Token is not accepted for payment");
        require(vendors[_vendorId] != address(0), "Vendor ID is not registered");
        require(_amount > 0, "Amount must be greater than zero");

        uint256 fee = _amount * feeBasisPoints / 10000;
        uint256 amountAfterFee = _amount - fee;

        require(IERC20(_token).transferFrom(msg.sender, vendors[_vendorId], amountAfterFee), "Transfer to vendor failed");
        require(IERC20(_token).transferFrom(msg.sender, feeRecipient, fee), "Transfer of fee failed");

        emit Purchase(msg.sender, _vendorId, _orderId, amountAfterFee, _token);
    }

    function purchaseWithEther(uint256 _vendorId, uint256 _orderId) public payable nonReentrant whenNotPaused {
        require(vendors[_vendorId] != address(0), "Vendor ID is not registered");
        require(msg.value > 0, "Amount must be greater than zero");

        uint256 fee = msg.value * feeBasisPoints / 10000;
        uint256 amountAfterFee = msg.value - fee;

        vendors[_vendorId].transfer(amountAfterFee);
        feeRecipient.transfer(fee);

        emit Purchase(msg.sender, _vendorId, _orderId, amountAfterFee, address(0));
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
