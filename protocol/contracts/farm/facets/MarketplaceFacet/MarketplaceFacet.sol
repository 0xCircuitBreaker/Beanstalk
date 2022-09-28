/**
 * SPDX-License-Identifier: MIT
 **/

pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/cryptography/ECDSA.sol";
import "./Order.sol";
import "../../Permit.sol";

/**
 * @author Beanjoyer
 * @title Pod Marketplace v2
 **/
contract MarketplaceFacet is Order, Permit {
    using SafeMath for uint256;

    /*
    * Pod Listing
    */
    
    /*
    * @notice **LEGACY**
    */
    function createPodListing(
        uint256 index,
        uint256 start,
        uint256 amount,
        uint24 pricePerPod,
        uint256 maxHarvestableIndex,
        LibTransfer.To mode
    ) external payable {
        _createPodListing(
            index,
            start,
            amount,
            pricePerPod,
            maxHarvestableIndex,
            mode
        );
    }

    function createPodListingV2(
        uint256 index,
        uint256 start,
        uint256 amount,
        uint256 maxHarvestableIndex,
        bytes calldata pricingFunction,
        LibTransfer.To mode
    ) external payable {
        _createPodListingV2(
            index,
            start,
            amount,
            maxHarvestableIndex,
            pricingFunction, 
            mode
        );
    }

    // Fill
    function fillPodListing(
        PodListing calldata l,
        uint256 beanAmount,
        LibTransfer.From mode
    ) external payable {
        beanAmount = LibTransfer.transferToken(
            C.bean(),
            msg.sender,
            l.account,
            beanAmount,
            mode,
            l.mode
        );
        _fillListing(l, beanAmount);
    }

    function fillPodListingV2(
        PodListing calldata l,
        uint256 beanAmount,
        bytes calldata pricingFunction,
        LibTransfer.From mode
    ) external payable {
        beanAmount = LibTransfer.transferToken(
            C.bean(),
            msg.sender,
            l.account,
            beanAmount,
            mode,
            l.mode
        );
        _fillListingV2(l, beanAmount, pricingFunction);
    }

    // Cancel
    function cancelPodListing(uint256 index) external payable {
        _cancelPodListing(msg.sender, index);
    }

    // Get
    function podListing(uint256 index) external view returns (bytes32) {
        return s.podListings[index];
    }

    /*
     * Pod Orders
     */

    // Create
    function createPodOrder(
        uint256 beanAmount,
        uint24 pricePerPod,
        uint256 maxPlaceInLine,
        LibTransfer.From mode
    ) external payable returns (bytes32 id) {
        beanAmount = LibTransfer.receiveToken(C.bean(), beanAmount, msg.sender, mode);
        return _createPodOrder(beanAmount, pricePerPod, maxPlaceInLine);
    }

    function createPodOrderV2(
        uint256 beanAmount,
        uint256 maxPlaceInLine,
        bytes calldata pricingFunction,
        LibTransfer.From mode
    ) external payable returns (bytes32 id) {
        beanAmount = LibTransfer.receiveToken(C.bean(), beanAmount, msg.sender, mode);
        return _createPodOrderV2(beanAmount, maxPlaceInLine, pricingFunction);
    }

    // Fill
    function fillPodOrder(
        PodOrder calldata o,
        uint256 index,
        uint256 start,
        uint256 amount,
        LibTransfer.To mode
    ) external payable {
        _fillPodOrder(o, index, start, amount, mode);
    }

    function fillPodOrderV2(
        PodOrder calldata o,
        uint256 index,
        uint256 start,
        uint256 amount,
        bytes calldata pricingFunction,
        LibTransfer.To mode
    ) external payable {
        _fillPodOrderV2(o, index, start, amount, pricingFunction, mode);
    }

    // Cancel
    function cancelPodOrder(
        uint24 pricePerPod,
        uint256 maxPlaceInLine,
        LibTransfer.To mode
    ) external payable {
        _cancelPodOrder(pricePerPod, maxPlaceInLine, mode);
    }

    function cancelPodOrderV2(
        uint256 maxPlaceInLine,
        bytes calldata pricingFunction,
        LibTransfer.To mode
    ) external payable {
        _cancelPodOrderV2(maxPlaceInLine, pricingFunction, mode);
    }

    // Get

    function podOrder(
        address account,
        uint24 pricePerPod,
        uint256 maxPlaceInLine
    ) external view returns (uint256) {
        return s.podOrders[
            createOrderId(
                account, 
                pricePerPod, 
                maxPlaceInLine
            )
        ];
    }

    function podOrderV2(
        address account,
        uint256 maxPlaceInLine,
        bytes calldata pricingFunction
    ) external view returns (uint256) {
        return s.podOrders[
            createOrderIdV2(
                account, 
                0,
                maxPlaceInLine, 
                pricingFunction
            )
        ];
    }

    function podOrderById(bytes32 id) external view returns (uint256) {
        return s.podOrders[id];
    }

    /*
     * Transfer Plot
     */

    function transferPlot(
        address sender,
        address recipient,
        uint256 id,
        uint256 start,
        uint256 end
    ) external payable nonReentrant {
        require(
            sender != address(0) && recipient != address(0),
            "Field: Transfer to/from 0 address."
        );
        uint256 amount = s.a[sender].field.plots[id];
        require(amount > 0, "Field: Plot not owned by user.");
        require(end > start && amount >= end, "Field: Pod range invalid.");
        amount = end - start; // Note: SafeMath is redundant here.
        if (msg.sender != sender && allowancePods(sender, msg.sender) != uint256(-1)) {
                decrementAllowancePods(sender, msg.sender, amount);
        }

        if (s.podListings[id] != bytes32(0)){
            _cancelPodListing(sender, id);
        }
        _transferPlot(sender, recipient, id, start, amount);
    }

    function approvePods(address spender, uint256 amount)
        external
        payable
        nonReentrant
    {
        require(spender != address(0), "Field: Pod Approve to 0 address.");
        setAllowancePods(msg.sender, spender, amount);
        emit PodApproval(msg.sender, spender, amount);
    }

    /// @notice permitPods sets pods allowance using permit
    /// @param account account address
    /// @param spender spender address
    /// @param amount allowance amount
    /// @param deadline permit deadline
    /// @param signature user's permit signature
    function permitPods(
        address account,
        address spender,
        uint256 amount,
        uint256 deadline,
        bytes memory signature
    ) external {
        require(spender != address(0), "Field: Pod Approve to 0 address.");
        require(block.timestamp <= deadline, "Field: expired deadline");

        bytes32 eip712DomainHash = _getEIP712DomainHash();

        bytes32 hashStruct = keccak256(
            abi.encode(
                keccak256(
                    "PermitPods(address account,address spender,uint256 amount,uint256 nonce,uint256 deadline)"
                ),
                account,
                spender,
                amount,
                _useNonce(account),
                deadline
            )
        );

        bytes32 hash = keccak256(
            abi.encodePacked("\x19\x01", eip712DomainHash, hashStruct)
        );

        address signer = ECDSA.recover(hash, signature);
        require(signer == account, "Field: invalid signature");

        setAllowancePods(account, spender, amount);
        emit PodApproval(account, spender, amount);
    }
}
