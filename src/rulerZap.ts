import { Address, BigDecimal, BigInt, Bytes, ethereum, log } from '@graphprotocol/graph-ts';
import {
  Transfer
} from "../generated/RulerToken/RulerToken"
import { Swap, Mint, Burn, Sync } from '../generated/RulerSushiLP/RulerSushiLP'
//import { Deposit, Withdraw } from '../generated/RulerMining/RulerMining'
import {Deposit, MarketMakeDeposit, Collect, Redeem, Repay, FlashLoan, RTokenCreated, PairAdded, PairAdded__Params, RERC20ImplUpdated__Params} from '../generated/RulerCore/RulerCore'
import { RepayEvent } from "../generated/schema"
import { Market,  Collateral, User, CollectEvent, RedeemEvent, MarketMakeDepositEvent, DepositEvent, FlashloanEvent } from "../generated/schema"
import { CurvefiFactory } from '../generated/templates/CurvefiFactory/CurvefiFactory'
import { getOrInitUser, getOrCreateCollateral, getOrCreatePairedToken, createMarket, initMarket, getSystemState, get_asset_price_USD, convert_asset_amt_USD,getOrCreateUserPosition, getMarket,getOrInitMetapool } from "./helper/initializer"
import { calculatePremiumPerUnitCollateral,calculateInterestRate,getColAmtFromRTokenAmt,getRTokenAmtFromColAmt,get_dy_underlying_lend,get_dy_underlying_borrow, } from "./utils/maths"
import { convertTokenAmountToDecimals, exponentToBigInt, exponentToBigDecimal, zeroBD, zeroBI } from './utils/converters';
import { RulerCore } from '../generated/RulerCore/RulerCore'
import { ORACLE_ADDRESS, RULER_CORE_ADDRESS, ZERO_ADDRESS} from "./utils/constants"
import {DepositAndSwapWithCurveCall,DepositWithPermitAndSwapWithCurveCall } from '../generated/RulerZap/RulerZap'


/*

Handle Borrowing via the zap contract.
Contract takes function calls, does not emit events. So uses call handler to get data. 
rrTokens sent to borrower, rcTokens sent to metapool address
*/


export function handleDepositWithPermitAndSwapWithCurve(call:DepositWithPermitAndSwapWithCurveCall): void{
    let collateral = getOrCreateCollateral(call.inputs._col)
    let paired = getOrCreatePairedToken(call.inputs._paired)
    let expiry = call.inputs._expiry
    let mintRatio = call.inputs._mintRatio
    let colAmt = call.inputs._colAmt
    let market = getMarket(collateral,paired,expiry,mintRatio)

    let rcTokenAmt = getRTokenAmtFromColAmt(colAmt,collateral.decimals,paired.decimals,mintRatio)
    
    let metapool = getOrInitMetapool(call.inputs._poolAddress,market)// getOrCreateRcMetapool(call.inputs._poolAddress)
    
    let paired_received = get_dy_underlying_borrow(Address.fromString(metapool.id),rcTokenAmt)

    let blocknumber = call.block.number
    let time = call.block.timestamp

    let price_usd = get_asset_price_USD(call.inputs._col)
    let col_amount_usd = price_usd.times(colAmt.toBigDecimal())

    // decimalize return values
    let colAmtDecimalized = convertTokenAmountToDecimals(colAmt,collateral.decimals)
    let pairedAmtDecimalized = convertTokenAmountToDecimals(paired_received,paired.decimals)
    let rcTokenAmtDecimalized = convertTokenAmountToDecimals(rcTokenAmt,paired.decimals)

    let userApy = calculateInterestRate("Borrow",time,expiry,rcTokenAmt.toBigDecimal(),pairedAmtDecimalized)

    let user = getOrInitUser(call.from);
    let userPosition = getOrCreateUserPosition(user, market)
    userPosition.amountCollateral = userPosition.amountCollateral.plus(colAmtDecimalized)
    userPosition.amountBorrowed = userPosition.amountBorrowed.plus(rcTokenAmt.toBigDecimal())
    userPosition.borrowAPY = userApy
    userPosition.currentPnL = rcTokenAmtDecimalized.minus(pairedAmtDecimalized)
    //userPosition.lendingAPY = apy
    userPosition.lastUpdateBlocknumber = blocknumber
    userPosition.lastUpdateTimestamp = time
    userPosition.rrTokenAmount = rcTokenAmt.toBigDecimal() // rrtokenamount is same as rctokenamount
    userPosition.save()
  
  
    market.borrowAPY = userApy

    // calculations for updating market current borrowing apy as well
    let lender_pair_received = get_dy_underlying_lend(Address.fromString(metapool.id),paired_received)
    let lender_pair_received_decimalized = convertTokenAmountToDecimals(lender_pair_received,paired.decimals)
    market.lendingAPY = calculateInterestRate("Lend",time,expiry,rcTokenAmt.toBigDecimal(),lender_pair_received_decimalized)
    market.totalCollateral = market.totalCollateral.plus(colAmtDecimalized)
    market.totalBorrowers = market.totalBorrowers.plus(BigInt.fromI32(1))
    market.premiumPerCollateralLent = calculatePremiumPerUnitCollateral(price_usd,mintRatio)
    market.lastUpdateBlocknumber = blocknumber
    market.lastUpdateTimestamp = time
    market.save()
  
  
    
    collateral.priceUSD = price_usd
    collateral.save()
  
    metapool.market = market.id
    metapool.save()
  
    let state = getSystemState(blocknumber,time)
    state.totalCollateral = state.totalCollateral.plus(col_amount_usd)
    state.totalDebt = state.totalDebt.plus(rcTokenAmtDecimalized)
    state.save()
}

export function handleDepositAndSwapWithCurve(call:DepositAndSwapWithCurveCall): void{
  let collateral = getOrCreateCollateral(call.inputs._col)
  let paired = getOrCreatePairedToken(call.inputs._paired)
  let expiry = call.inputs._expiry
  let mintRatio = call.inputs._mintRatio
  let colAmt = call.inputs._colAmt
  let rcTokenAmt = getRTokenAmtFromColAmt(colAmt,collateral.decimals,paired.decimals,mintRatio)
  let market = getMarket(collateral,paired,expiry,mintRatio)
  let metapool = getOrInitMetapool(call.inputs._poolAddress,market)

  let paired_received = get_dy_underlying_borrow(Address.fromString(metapool.id),rcTokenAmt)
  let blocknumber = call.block.number
  let time = call.block.timestamp


  // decimalize return values
  let colAmtDecimalized = convertTokenAmountToDecimals(colAmt,collateral.decimals)
  let pairedAmtDecimalized = convertTokenAmountToDecimals(paired_received,paired.decimals)
  let rcTokenAmtDecimalized = convertTokenAmountToDecimals(rcTokenAmt,paired.decimals)

  let price_usd = get_asset_price_USD(call.inputs._col)
  let col_amount_usd = price_usd.times(colAmt.toBigDecimal())


  let userApy = calculateInterestRate("Borrow",time,expiry,rcTokenAmt.toBigDecimal(),pairedAmtDecimalized)

  let user = getOrInitUser(call.from);
  let userPosition = getOrCreateUserPosition(user, market)
  userPosition.amountCollateral = userPosition.amountCollateral.plus(colAmtDecimalized)
  userPosition.amountBorrowed = userPosition.amountBorrowed.plus(rcTokenAmt.toBigDecimal())
  userPosition.borrowAPY = userApy
  userPosition.currentPnL = rcTokenAmtDecimalized.minus(pairedAmtDecimalized)
  //userPosition.lendingAPY = apy
  userPosition.lastUpdateBlocknumber = blocknumber
  userPosition.lastUpdateTimestamp = time
  userPosition.rrTokenAmount = rcTokenAmt.toBigDecimal() // rrtokenamount is same as rctokenamount
  userPosition.save()


  market.borrowAPY = userApy

  // calculations for updating market current borrowing apy as well
  let lender_pair_received = get_dy_underlying_lend(Address.fromString(metapool.id),paired_received)
  let lender_pair_received_decimalized = convertTokenAmountToDecimals(lender_pair_received,paired.decimals)
  market.lendingAPY = calculateInterestRate("Lend",time,expiry,rcTokenAmt.toBigDecimal(),lender_pair_received_decimalized)
  market.totalCollateral = market.totalCollateral.plus(colAmtDecimalized)
  market.totalBorrowers = market.totalBorrowers.plus(BigInt.fromI32(1))
  market.premiumPerCollateralLent = calculatePremiumPerUnitCollateral(price_usd,mintRatio)
  market.lastUpdateBlocknumber = blocknumber
  market.lastUpdateTimestamp = time
  market.save()


  
  collateral.priceUSD = price_usd
  collateral.save()

  metapool.market = market.id
  metapool.save()

  let state = getSystemState(blocknumber,time)
  state.totalCollateral = state.totalCollateral.plus(col_amount_usd)
  state.totalDebt = state.totalDebt.plus(rcTokenAmtDecimalized)
  state.save()
}