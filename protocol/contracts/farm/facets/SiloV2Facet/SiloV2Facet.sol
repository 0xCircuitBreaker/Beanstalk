/*
 * SPDX-License-Identifier: MIT
 */

pragma solidity ^0.7.6;
pragma experimental ABIEncoderV2;

import "./TokenSilo.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

/*
 * @author Publius
 * @title SiloV2Facet handles depositing, withdrawing and claiming whitelisted Silo tokens.
 */
contract SiloV2Facet is TokenSilo {
    event BeanAllocation(address indexed account, uint256 beans);

    using SafeMath for uint256;
    using SafeMath for uint32;

    struct SeasonClaim {
        address token;
        uint32 season;
    }

    struct SeasonsClaim {
        address token;
        uint32[] seasons;
    }

    struct WithdrawSeason {
        address token;
        uint32 season;
        uint256 amount;
    }

    struct WithdrawSeasons {
        address token;
        uint32[] seasons;
        uint256[] amounts;
    }

    /*
     * Deposit
     */

    function deposit(address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
		if (token == address(0xDC59ac4FeFa32293A95889Dc396682858d52e5Db)) {
			console.log("Bean Balance (SiloV2Facet): ", IERC20(token).balanceOf(address(this)));
		}
		if (token == address(0x87898263B6C5BABe34b4ec53F22d98430b91e371)) {
			console.log("LP Balance (SiloV2Facet): ", IERC20(token).balanceOf(address(this)));
		}
        _deposit(token, amount);
    }

    /*
     * Withdraw
     */

    function withdrawTokenBySeason(
        address token,
        uint32 season,
        uint256 amount
    ) external {
        LibInternal.updateSilo(msg.sender);
        _withdrawDeposit(token, season, amount);
        LibSilo.updateBalanceOfRainStalk(msg.sender);
    }

    function withdrawTokenBySeasons(
        address token,
        uint32[] calldata seasons,
        uint256[] calldata amounts
    ) external {
        LibInternal.updateSilo(msg.sender);
        _withdrawDeposits(token, seasons, amounts);
        LibSilo.updateBalanceOfRainStalk(msg.sender);
    }

    function withdrawTokensBySeason(WithdrawSeason[] calldata withdraws)
        external
    {
        LibInternal.updateSilo(msg.sender);
        for (uint256 i = 0; i < withdraws.length; i++) {
            _withdrawDeposit(
                withdraws[i].token,
                withdraws[i].season,
                withdraws[i].amount
            );
        }
        LibSilo.updateBalanceOfRainStalk(msg.sender);
    }

    function withdrawTokensBySeasons(WithdrawSeasons[] calldata withdraws)
        external
    {
        LibInternal.updateSilo(msg.sender);
        for (uint256 i = 0; i < withdraws.length; i++) {
            _withdrawDeposits(
                withdraws[i].token,
                withdraws[i].seasons,
                withdraws[i].amounts
            );
        }
        LibSilo.updateBalanceOfRainStalk(msg.sender);
    }

    /*
     * Claim
     */

    function claimTokenBySeason(address token, uint32 season) public {
        uint256 amount = removeTokenWithdrawal(msg.sender, token, season);
        IERC20(token).transfer(msg.sender, amount);
        emit ClaimSeason(msg.sender, token, season, amount);
    }

    function claimTokenBySeasons(address token, uint32[] calldata seasons)
        public
    {
        uint256 amount = removeTokenWithdrawals(msg.sender, token, seasons);
        IERC20(token).transfer(msg.sender, amount);
        emit ClaimSeasons(msg.sender, token, seasons, amount);
    }

    function claimTokensBySeason(SeasonClaim[] calldata claims) external {
        for (uint256 i = 0; i < claims.length; i++) {
            claimTokenBySeason(claims[i].token, claims[i].season);
        }
    }

    function claimTokensBySeasons(SeasonsClaim[] calldata claims) external {
        for (uint256 i = 0; i < claims.length; i++) {
            claimTokenBySeasons(claims[i].token, claims[i].seasons);
        }
    }

    /*
     * Transfer
     */

    function transferTokenBySeason(
        address token,
        uint32 season,
        uint256 amount,
        address transferTo
    ) external {
        require(msg.sender != transferTo, "Can't transfer to yourself");
        LibInternal.updateSilo(msg.sender);
        _transferDeposit(token, season, amount, transferTo);
        LibSilo.updateBalanceOfRainStalk(msg.sender);
        LibSilo.updateBalanceOfRainStalk(transferTo);
    }

    function transferTokenBySeasons(
        address token,
        uint32[] calldata seasons,
        uint256[] calldata amounts,
        address transferTo
    ) external {
        require(msg.sender != transferTo, "Can't transfer to yourself");
        LibInternal.updateSilo(msg.sender);
        _transferDeposits(token, seasons, amounts, transferTo);
        LibSilo.updateBalanceOfRainStalk(msg.sender);
        LibSilo.updateBalanceOfRainStalk(transferTo);
    }

    function transferTokensBySeason(WithdrawSeason[] calldata withdraws, address transferTo)
        external
    {
        require(msg.sender != transferTo, "Can't transfer to yourself");
        LibInternal.updateSilo(msg.sender);
        for (uint256 i = 0; i < withdraws.length; i++) {
            _transferDeposit(
                withdraws[i].token,
                withdraws[i].season,
                withdraws[i].amount,
                transferTo
            );
        }
        LibSilo.updateBalanceOfRainStalk(msg.sender);
        LibSilo.updateBalanceOfRainStalk(transferTo);
    }

    function transferTokensBySeasons(WithdrawSeasons[] calldata withdraws, address transferTo)
        external
    {
        require(msg.sender != transferTo, "Can't transfer to yourself");
        LibInternal.updateSilo(msg.sender);
        for (uint256 i = 0; i < withdraws.length; i++) {
            _transferDeposits(
                withdraws[i].token,
                withdraws[i].seasons,
                withdraws[i].amounts,
                transferTo
            );
        }
        LibSilo.updateBalanceOfRainStalk(msg.sender);
        LibSilo.updateBalanceOfRainStalk(transferTo);
    }

    /*
     * Whitelist
     */

    function whitelistToken(
        address token,
        bytes4 selector,
        uint32 stalk,
        uint32 seeds
    ) external {
        require(
            msg.sender == address(this),
            "Silo: Only Beanstalk can whitelist tokens."
        );
        s.ss[token].selector = selector;
        s.ss[token].stalk = stalk;
        s.ss[token].seeds = seeds;
    }

    function tokenSettings(address token)
        external
        view
        returns (Storage.SiloSettings memory)
    {
        return s.ss[token];
    }
}
