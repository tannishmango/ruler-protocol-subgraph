
import { Address, BigDecimal, BigInt, Bytes, ethereum, log } from '@graphprotocol/graph-ts';

import {
  Transfer
} from "../generated/RulerToken/RulerToken"
import { Swap, Mint, Burn, Sync } from '../generated/RulerSushiLP/RulerSushiLP'
//import { Deposit, Withdraw } from '../generated/RulerMining/RulerMining'
import {Deposit, MarketMakeDeposit, Collect, Redeem, Repay, FlashLoan, RTokenCreated, PairAdded, PairAdded__Params, RERC20ImplUpdated__Params} from '../generated/RulerCore/RulerCore'
import { Market,  Collateral, User, CollectEvent, RedeemEvent, RepayEvent, MarketMakeDepositEvent, DepositEvent, FlashloanEvent, UserPosition } from "../generated/schema"
import { RulerOracle } from '../generated/RulerOracle/RulerOracle'
import { getOrInitUser, getOrCreateCollateral, getOrCreatePairedToken, createMarket, initMarket, getSystemState, get_asset_price_USD, convert_asset_amt_USD,getOrCreateUserPosition, getMarket } from "./helper/initializer"
import { calculatePremiumPerUnitCollateral,calculateInterestRate,getColAmtFromRTokenAmt,getRTokenAmtFromColAmt,get_dy_underlying_lend,get_dy_underlying_borrow, } from "./utils/maths"
import { convertTokenAmountToDecimals, exponentToBigInt, exponentToBigDecimal, zeroBD } from './utils/converters';
import { RulerCore } from '../generated/RulerCore/RulerCore'
import { ORACLE_ADDRESS, RULER_CORE_ADDRESS, ZERO_ADDRESS} from "./utils/constants"





export function handlePairAdded(event: PairAdded): void {
  let market = createMarket(event.params);
  initMarket(market);
}



/*


*/

/*
export function handleDepositEvent(event: Deposit): void {
  
  let collateral = getOrCreateCollateral(event.params.collateral);
  let pairedToken = getOrCreatePairedToken(event.params.paired)
  let expiry = event.params.expiry
  let mintRatio = event.params.mintRatio
  let market = getMarket(collateral,pairedToken,expiry,mintRatio)
  let blocknumber = event.block.number
  let time = event.block.timestamp
  let price_usd = get_asset_price_USD(collateral.id,collateral.decimals)
  let amount_usd = convert_asset_amt_USD(collateral.id,collateral.decimals,event.params.amount) 
  let apy = calculateMarketApy(time,expiry,mintRatio.toBigDecimal())
  let rTokensMinted = getRTokenAmtFromColAmt(event.params.amount,collateral.decimals,pairedToken.decimals,mintRatio)
  let collateralAmount = convertTokenAmountToDecimals(event.params.amount,collateral.decimals)

  let user = getOrInitUser(event.params.user);
  let userPosition = getOrCreateUserPosition(user, market)
  userPosition.amountCollateral = userPosition.amountCollateral.plus(collateralAmount)
  userPosition.amountBorrowed = userPosition.amountBorrowed.plus(rTokensMinted)
  userPosition.borrowAPY = apy
  //userPosition.lendingAPY = apy
  userPosition.lastUpdateBlocknumber = blocknumber
  userPosition.lastUpdateTimestamp = time
  userPosition.rrTokenAmount = rTokensMinted
  userPosition.rcTokenAmount = rTokensMinted
  userPosition.save()


  market.borrowAPY = apy
  //market.lendingAPY = apy
  market.totalCollateral = market.totalCollateral.plus(collateralAmount)
  market.totalBorrowers = market.totalBorrowers.plus(BigInt.fromI32(1))
  market.premiumPerCollateralLent = calculatePremiumPerUnitCollateral(price_usd,mintRatio)
  market.lastUpdateBlocknumber = blocknumber
  market.lastUpdateTimestamp = time
  market.save()


  
  collateral.priceUSD = price_usd
  collateral.save()


  let state = getSystemState(event.block.number,event.block.timestamp)
  state.totalCollateral = state.totalCollateral.plus(amount_usd)
  state.totalDebt = state.totalDebt.plus(rTokensMinted)
  state.save()

  let depositEvent = new DepositEvent(event.transaction.hash.toHexString()+"_"+ event.block.timestamp)
  depositEvent.user = getOrInitUser(event.params.user).id;
  depositEvent.market = getMarket(collateral,pairedToken,expiry,mintRatio).id
  depositEvent.collateralAmountDeposited = event.params.amount.toBigDecimal()
  depositEvent.mintAmount = getRTokenAmtFromColAmt(event.params.amount,collateral.decimals,pairedToken.decimals,mintRatio)
  depositEvent.blocknumber = event.block.number
  depositEvent.timestamp = event.block.timestamp
  depositEvent.save()
}

*/




/*
mmdeposit: supply stablecoin, receive rcTokens
*/

export function handleMarketMakeDeposit(event: MarketMakeDeposit): void {
  /*

  */ 
  let collateral = getOrCreateCollateral(event.params.collateral);
  let pairedToken = getOrCreatePairedToken(event.params.paired)
  let expiry = event.params.expiry
  let mintRatio = event.params.mintRatio
  let market = getMarket(collateral,pairedToken,expiry,mintRatio)
  let rcTokenDecimals = pairedToken.decimals
  let colAmount = getColAmtFromRTokenAmt(event.params.amount,collateral.decimals,rcTokenDecimals,mintRatio)
  let price_usd = get_asset_price_USD(event.params.collateral)
  
  let colAmtDecimalized = convertTokenAmountToDecimals(colAmount,collateral.decimals)
  let colAmountUsd = price_usd.times(colAmtDecimalized)


  let blocknumber = event.block.number
  let time = event.block.timestamp
  

  let rcTokensMinted = convertTokenAmountToDecimals(event.params.amount,rcTokenDecimals)
  let fees = rcTokensMinted.times(market.feeRate)
  
  let user = getOrInitUser(event.params.user)
  //let userPosition = new UserPosition
  let userPosition = getOrCreateUserPosition(user, market)
  userPosition.user = user.id
  userPosition.amountCollateral = userPosition.amountCollateral.plus(colAmtDecimalized)
  userPosition.lastUpdateBlocknumber = blocknumber
  userPosition.lastUpdateTimestamp = time
  userPosition.rcTokenAmount = rcTokensMinted
  userPosition.save()


  market.totalCollateral = market.totalCollateral.plus(colAmtDecimalized)
  market.totalLenders = market.totalLenders.plus(BigInt.fromI32(1))
  market.premiumPerCollateralLent = calculatePremiumPerUnitCollateral(price_usd,mintRatio)
  market.lastUpdateBlocknumber = blocknumber
  market.lastUpdateTimestamp = time
  market.fees = market.fees.plus(fees)
  market.save()


  
  collateral.priceUSD = price_usd
  collateral.save()

  let state = getSystemState(event.block.number,event.block.timestamp)
  state.totalCollateral = state.totalCollateral.plus(colAmountUsd)
  state.totalFees = state.totalFees.plus(fees)
  state.save()

  let mmDeposit = new MarketMakeDepositEvent(event.transaction.hash.toHexString())
  mmDeposit.user = user.id
  mmDeposit.mintAmount = rcTokensMinted
  mmDeposit.fees = fees
  mmDeposit.market = market.id
  mmDeposit.collateralAmountDeposited = colAmtDecimalized
  mmDeposit.timestamp = time
  mmDeposit.blocknumber = blocknumber
  mmDeposit.save()
}

/*
export function handleRedeemEvent(event: Redeem): void {
  let user = getOrInitUser(event.params.user);
  let collateral = getOrCreateCollateral(event.params.collateral);
  let pairedToken = getOrCreatePairedToken(event.params.paired)
  let expiry = event.params.expiry
  let mintRatio = event.params.mintRatio
  let market = getMarket(collateral,pairedToken,expiry,mintRatio)
  let state = getSystemState(event.block.number,event.block.timestamp)
  let userPosition = getOrCreateUserPosition(user, market)

  let blocknumber = event.block.number
  let time = event.block.timestamp
  
  let price_usd = get_asset_price_USD(collateral.id,collateral.decimals)
  let rcTokenDecimals = getOrInitRcToken(Address.fromHexString(market.rcToken)).decimals

  let apy = calculateMarketApy(time,expiry,mintRatio.toBigDecimal())
  let rtokensPaid = convertTokenAmountToDecimals(event.params.amount,rcTokenDecimals)
  let colAmount = getColAmtFromRTokenAmt(event.params.amount,collateral.decimals,rcTokenDecimals,mintRatio)
  let colAmountUsd = price_usd.times(colAmount)
  let fees = colAmount.times(market.feeRate)
  let feesUSD = colAmountUsd.times(market.feeRate)

  userPosition.amountCollateral = userPosition.amountCollateral.minus((colAmount).minus(fees))
  
  userPosition.rcTokenAmount = userPosition.rcTokenAmount.minus(rtokensPaid)
  if(userPosition.rcTokenAmount!=zeroBD()){
    userPosition.lendingAPY = apy
    userPosition.borrowAPY = apy


  }
  else{
    userPosition.lendingAPY = zeroBD()
    userPosition.borrowAPY = zeroBD()
  }
  userPosition.lastUpdateBlocknumber = blocknumber
  userPosition.lastUpdateTimestamp = time
  userPosition.save()

  market.borrowAPY = apy
  market.lendingAPY = apy
  market.totalCollateral = market.totalCollateral.minus(colAmount)
  market.totalLenders = market.totalLenders.minus(BigInt.fromI32(1))
  market.totalBorrowers = market.totalBorrowers.minus(BigInt.fromI32(1))
  market.premiumPerCollateralLent = calculatePremiumPerUnitCollateral(price_usd,mintRatio)
  market.fees = market.fees.plus(fees)
  market.lastUpdateBlocknumber = blocknumber
  market.lastUpdateTimestamp = time
  market.save()


  
  collateral.priceUSD = price_usd
  collateral.save()



  state.totalCollateral = state.totalCollateral.minus(colAmountUsd)
  state.totalFees = state.totalFees.plus(feesUSD)
  state.totalDebt = state.totalDebt.minus(rtokensPaid)
  state.totalRepaid = state.totalRepaid.plus(rtokensPaid)

  state.save()

  let redeem = new RedeemEvent(event.transaction.hash.toHexString())
  redeem.user = user.id
  redeem.market = market.id
  redeem.collateralAmountRedeemed = colAmount
  redeem.fees = fees
  redeem.rTokenAmount = rtokensPaid
  redeem.timestamp = time
  redeem.blocknumber = blocknumber
  redeem.save()
}
*/

/*
export function handleRepayEvent(event: Repay): void {

  let user = getOrInitUser(event.params.user);
  let collateral = getOrCreateCollateral(event.params.collateral);
  let pairedToken = getOrCreatePairedToken(event.params.paired)
  let expiry = event.params.expiry
  let mintRatio = event.params.mintRatio
  let market = getMarket(collateral,pairedToken,expiry,mintRatio)
  let state = getSystemState(event.block.number,event.block.timestamp)
  let userPosition = getOrCreateUserPosition(user, market)

  let blocknumber = event.block.number
  let time = event.block.timestamp
  
  let price_usd = get_asset_price_USD(collateral.id,collateral.decimals)
  //let amount_usd = convert_asset_amt_USD(collateral.id,collateral.decimals,event.params.amount) 
  let rrTokenDecimals = getOrInitRrToken(Address.fromHexString(market.rrToken)).decimals

  let apy = calculateMarketApy(time,expiry,mintRatio.toBigDecimal())
  let rrTokensPaid = convertTokenAmountToDecimals(event.params.amount,rrTokenDecimals)
  let colAmount = getColAmtFromRTokenAmt(event.params.amount,collateral.decimals,rrTokenDecimals,mintRatio)
  let colAmountUsd = price_usd.times(colAmount)
  let fees = rrTokensPaid.times(market.feeRate)

  userPosition.amountCollateral = userPosition.amountCollateral.minus(colAmount)
  userPosition.amountBorrowed = userPosition.amountBorrowed.minus(rrTokensPaid)
  userPosition.isExpired = false
  userPosition.rrTokenAmount = userPosition.rrTokenAmount.minus(rrTokensPaid)
  if(userPosition.rrTokenAmount!=zeroBD()){
    userPosition.borrowAPY = apy

  }
  else{
    userPosition.borrowAPY = zeroBD()
  }
  userPosition.lastUpdateBlocknumber = blocknumber
  userPosition.lastUpdateTimestamp = time
  userPosition.save()

  market.borrowAPY = zeroBD()
  market.lendingAPY = zeroBD()
  market.totalCollateral = market.totalCollateral.minus(colAmount)
  //market.totalLenders = market.totalLenders.minus(BigInt.fromI32(1))
  market.totalBorrowers = market.totalBorrowers.minus(BigInt.fromI32(1))
  market.premiumPerCollateralLent = calculatePremiumPerUnitCollateral(price_usd,mintRatio)
  market.fees = market.fees.plus(fees)
  market.lastUpdateBlocknumber = blocknumber
  market.lastUpdateTimestamp = time
  market.save()


  
  collateral.priceUSD = price_usd
  collateral.save()



  state.totalCollateral = state.totalCollateral.minus(colAmountUsd)
  state.totalFees = state.totalFees.plus(fees)

  state.totalDebt = state.totalDebt.minus(rrTokensPaid)
  state.totalRepaid = state.totalRepaid.plus(rrTokensPaid)
  state.totalDefaulted = state.totalDefaulted()

  state.save()

  let repayEvent = new RepayEvent(event.transaction.hash.toHexString())
  repayEvent.user = user.id
  repayEvent.market = market.id
  repayEvent.rrTokenAmountRepaid = rrTokensPaid
  repayEvent.collateralAmountReceived = colAmount
  repayEvent.fees = fees
  repayEvent.timestamp = time
  repayEvent.blocknumber = blocknumber
  repayEvent.save()

}
*/


/*
sender collect paired tokens by returning same amount of rcTokens to Ruler
*/

/*
export function handleCollectEvent(event: Collect): void {
  let user = getOrInitUser(event.params.user);
  let collateral = getOrCreateCollateral(event.params.collateral);
  let pairedToken = getOrCreatePairedToken(event.params.paired)
  let expiry = event.params.expiry
  let mintRatio = event.params.mintRatio
  let market = getMarket(collateral,pairedToken,expiry,mintRatio)
  let state = getSystemState(event.block.number,event.block.timestamp)
  let userPosition = getOrCreateUserPosition(user, market )

  let blocknumber = event.block.number
  let time = event.block.timestamp
  
  let price_usd = get_asset_price_USD(collateral.id,collateral.decimals)
  //let amount_usd = convert_asset_amt_USD(collateral.id,collateral.decimals,event.params.amount) 
  let rcTokenDecimals = getOrInitRrToken(Address.fromHexString(market.rcToken)).decimals

  let apy = calculateMarketApy(time,expiry,mintRatio.toBigDecimal())
  let rcTokensPaid = convertTokenAmountToDecimals(event.params.amount,rcTokenDecimals)
  let colAmount = getColAmtFromRTokenAmt(event.params.amount,collateral.decimals,rcTokenDecimals,mintRatio)
  let colAmountUsd = price_usd.times(colAmount)
  let fees = rcTokensPaid.times(market.feeRate)

  userPosition.amountCollateral = userPosition.amountCollateral.minus(colAmount)
  userPosition.amountBorrowed = userPosition.amountBorrowed.minus(rcTokensPaid)
  userPosition.isExpired = true
  userPosition.rrTokenAmount = userPosition.rrTokenAmount.minus(rcTokensPaid)
  if(userPosition.rcTokenAmount!=zeroBD()){
    userPosition.borrowAPY = zeroBD()

  }
  else{
    userPosition.borrowAPY = zeroBD()
  }
  userPosition.lastUpdateBlocknumber = blocknumber
  userPosition.lastUpdateTimestamp = time
  userPosition.save()

  market.borrowAPY = zeroBD()
  market.lendingAPY = zeroBD()
  market.totalCollateral = market.totalCollateral.minus(colAmount)
  //market.totalLenders = market.totalLenders.minus(BigInt.fromI32(1))
  market.totalBorrowers = market.totalBorrowers.minus(BigInt.fromI32(1))
  market.premiumPerCollateralLent = calculatePremiumPerUnitCollateral(price_usd,mintRatio)
  market.fees = market.fees.plus(fees)
  market.lastUpdateBlocknumber = blocknumber
  market.lastUpdateTimestamp = time
  market.save()


  
  collateral.priceUSD = price_usd
  collateral.save()



  state.totalCollateral = state.totalCollateral.minus(colAmountUsd)
  state.totalFees = state.totalFees.plus(fees)

  state.totalDebt = state.totalDebt.minus(rrTokensPaid)
  state.totalRepaid = state.totalRepaid.plus(rrTokensPaid)
  state.totalDefaulted = state.totalDefaulted()

  state.save()

  let repayEvent = new RepayEvent(event.transaction.hash.toHexString())
  repayEvent.user = user.id
  repayEvent.market = market.id
  repayEvent.rrTokenAmountRepaid = rrTokensPaid
  repayEvent.collateralAmountReceived = colAmount
  repayEvent.fees = fees
  repayEvent.timestamp = time
  repayEvent.blocknumber = blocknumber
  repayEvent.save()
}
*/

export function handleFlashLoanEvent(event: FlashLoan): void {
  let flashLoanEvent = new FlashloanEvent(event.transaction.hash.toHexString())
  
  let user = getOrInitUser(event.params._borrower);
  let token = getOrCreateCollateral(event.params._token)
  let amount = event.params._amount//convertTokenAmountToDecimals(event.params._amount,token.decimals)
  let flashLoanRate = RulerCore.bind(RULER_CORE_ADDRESS).flashLoanRate()
  let price_usd = get_asset_price_USD(event.params._token)
  let rawFee = convertTokenAmountToDecimals(amount.times(flashLoanRate),18)
  let feeUSD = rawFee.times(price_usd)
  let decimals = token.decimals

  flashLoanEvent.user = user.id
  flashLoanEvent.token = Address.fromString(token.id)
  flashLoanEvent.amount = convertTokenAmountToDecimals(amount,decimals).times(price_usd)
  flashLoanEvent.fees = feeUSD
  flashLoanEvent.timestamp = event.block.timestamp
  flashLoanEvent.blocknumber = event.block.number
  flashLoanEvent.save()

  let state = getSystemState(event.block.number,event.block.timestamp)
  state.totalFees = state.totalFees.plus(feeUSD)
  state.save()
}





/*
export function handleTransfer(event: Transfer): void {
  
  let rulerToken = new RulerTransfer(event.transaction.from.toHex())
  rulerToken.from = event.params.from;
  rulerToken.to = event.params.to;
  rulerToken.value = event.params.value;

  rulerToken.save()
}

export function handleSwap(event: Swap): void {
  
  let swap = new RulerSwap(event.transaction.from.toHex())
  swap.sender = event.params.sender;
  swap.amount0In = event.params.amount0In;
  swap.amount1In = event.params.amount1In;
  swap.amount0Out = event.params.amount0Out;
  swap.amount1Out = event.params.amount1Out;
  swap.to = event.params.to;

  swap.save()
}

export function handleMint(event: Mint): void {
  
  let mint = new RulerMint(event.transaction.from.toHex())
  mint.sender = event.params.sender;
  mint.amount0 = event.params.amount0;
  mint.amount1 = event.params.amount1;

  mint.save();
}

export function handleBurn(event: Burn): void {
  
  let burn = new RulerBurn(event.transaction.from.toHex())
  burn.amount0 = event.params.amount0;
  burn.amount1 = event.params.amount1;

  burn.save();
}

export function handleSync(event: Sync): void {
  
  let sync = new RulerSync(event.transaction.from.toHex())
  sync.reserve0 = event.params.reserve0;
  sync.reserve1 = event.params.reserve1;

  sync.save();
}

export function handleWithdraw(event: Withdraw): void {
  
  let whitdraw = new RulerWithdraw(event.transaction.from.toHex())
  whitdraw._lpToken = event.params.lpToken
  whitdraw._amount = event.params.amount

  whitdraw.save()
}

export function handleDeposit(event: Deposit): void {
  
  let deposit = new RulerDeposit(event.transaction.from.toHex())
  deposit.lpToken = event.params.lpToken
  deposit.amount = event.params.amount

  deposit.save()
}
*/
