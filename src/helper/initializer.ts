import { Address, BigDecimal, BigInt, Bytes, ethereum, log } from '@graphprotocol/graph-ts';
import {
  exponentToBigInt,
    PRICE_ORACLE_ASSET_PLATFORM_SIMPLE,
    PRICE_ORACLE_ASSET_TYPE_SIMPLE,
    zeroAddress,
    zeroBD,
    zeroBI,
  } from '../utils/converters';
import { User, Collateral, PairedToken, Market, SystemState, UserPosition, Metapool } from "../../generated/schema"
import { Transfer, RERC20 } from "../../generated/templates/RERC20/RERC20"
import { convertTokenAmountToDecimals } from "../utils/converters"
import { RulerOracle } from '../../generated/RulerOracle/RulerOracle'
import { RulerCore,RulerCore__getPairListResultValue0Struct } from '../../generated/RulerCore/RulerCore'

import { PairAdded__Params } from '../../generated/RulerCore/RulerCore'
import { calculatePremiumPerUnitCollateral } from "../utils/maths"
import { ORACLE_ADDRESS, RULER_CORE_ADDRESS} from "../utils/constants"



export function get_asset_price_USD(address: Address): BigDecimal {
  let priceOracle = RulerOracle.bind(ORACLE_ADDRESS)
  let priceCall = priceOracle.try_getPriceUSD(address)
  let price = priceCall.reverted ? BigInt.fromI32(0) : priceCall.value
  let assetPriceUsd = convertTokenAmountToDecimals(price,8)
  //let assetPriceUsd = convertTokenAmountToDecimals(priceOracle.getPriceUSD(address),assetDecimals)
  return assetPriceUsd;
}

export function convert_asset_amt_USD(address: Address, assetAmount:BigInt,decimals:BigInt): BigDecimal {
  let assetPriceUsd = get_asset_price_USD(address)
  let amount = convertTokenAmountToDecimals(assetAmount,decimals)
  let amt_usd = amount.times(assetPriceUsd)
  return amt_usd
}






export function getOrInitUser(address: Address): User {
    let user = User.load(address.toHexString())
    if(!user) {
        user = new User(address.toHexString())
        user.totalPnL = zeroBD()
        user.save();
    }
    return user as User;
}

export function getOrCreatePairedToken(address: Address): PairedToken {
  let paired = PairedToken.load(address.toHexString())
  if(!paired) {
    
    paired = new PairedToken(address.toHexString())

    let symbol = RERC20.bind(address).try_symbol()
    let decimals = RERC20.bind(address).try_decimals()

    paired.symbol = symbol.reverted ? '' : symbol.value.toString()
    paired.decimals = decimals.reverted ? 0 : decimals.value

    paired.save();
  }
  return paired as PairedToken;
}

export function getOrCreateCollateral(address: Address): Collateral {
  let collateral = Collateral.load(address.toHexString())
  if(!collateral) {
    
    collateral = new Collateral(address.toHexString())

    let symbol = RERC20.bind(address).try_symbol()
    let decimals = RERC20.bind(address).try_decimals()

    collateral.symbol = symbol.reverted ? '' : symbol.value.toString()
    collateral.decimals = decimals.reverted ? 0 : decimals.value
    collateral.minColRatio = zeroBD()
    collateral.priceUSD = zeroBD()
    collateral.save();
  }
  return collateral as Collateral
}




function generateMarketId(collateral: Collateral, paired: PairedToken, expiry: BigInt, mintRatio: BigInt): string {
  let collateralSymbol = getOrCreateCollateral(Address.fromString(collateral.id)).symbol
  let pairedSymbol = getOrCreatePairedToken(Address.fromString(paired.id)).symbol
  let mintStr = mintRatio.toString().slice(0,2)

  let exp = expiry.toString()

  let marketId = collateralSymbol + "_" + mintStr + "_"+ pairedSymbol + "_" + exp
  return marketId
}

export function createMarket(event: PairAdded__Params): Market {
  let collateral = getOrCreateCollateral(event.collateral) 
  let paired = getOrCreatePairedToken(event.paired)
  let marketID = generateMarketId(collateral,paired,event.expiry,event.mintRatio)
  let market = new Market(marketID)
  let price_usd = get_asset_price_USD(event.collateral)
  collateral.priceUSD = price_usd
  collateral.save()
  market.lastUpdateBlocknumber = event._event.block.number
  market.lastUpdateTimestamp = event._event.block.timestamp
  market.collateral = collateral.id
  market.pairedToken = paired.id
  market.expiry = event.expiry
  market.mintRatio = convertTokenAmountToDecimals(event.mintRatio,18)
  market.fees = zeroBD()
  market.feeRate = zeroBD()
  market.borrowAPY = zeroBD()
  market.lendingAPY = zeroBD()
  market.rcToken = null
  market.rrToken = null
  market.totalCollateral = zeroBD()
  market.totalBorrowers = zeroBI()
  market.totalLenders = zeroBI()
  market.premiumPerCollateralLent = calculatePremiumPerUnitCollateral(price_usd,event.mintRatio)
  market.save()
  return market as Market
}

export function initMarket(market: Market): void {
  let rulerCoreContract = RulerCore.bind(RULER_CORE_ADDRESS)
  let expiry = market.expiry
  let mintRat = market.mintRatio.toString()
  let mintRatio = exponentToBigInt(18).times(BigInt.fromString(mintRat))
  let collateral = Collateral.load(market.collateral)
  let collatDecimals = collateral.decimals
  let pairedAddr = Address.fromHexString(market.pairedToken)
  let pairListTuple = rulerCoreContract.getPairList(Address.fromString(collateral.id))
  //Address.from
  for (let i = 0; i < pairListTuple.length; i++) {
     let val = pairListTuple[i];
     if(val.expiry == expiry && val.pairedToken == pairedAddr && val.mintRatio == mintRatio){
      let rcTokenAddr = val.rcToken
      market.rcToken = rcTokenAddr

      let rrTokenAddr = val.rrToken
      market.rrToken = rrTokenAddr
      
      let feeRate = val.feeRate
      market.feeRate = convertTokenAmountToDecimals(feeRate,18)
      
      val.colTotal
      market.totalCollateral = convertTokenAmountToDecimals(val.colTotal,collatDecimals)
      market.save()

     }
  }
}

export function getMarket(collateral: Collateral, paired: PairedToken, expiry: BigInt, mintRatio: BigInt): Market {
  let marketId = generateMarketId(collateral,paired,expiry, mintRatio)
  let market = Market.load(marketId)
  return market as Market
}
/*



*/


function formatUserPositionId(user: User, marketId: string): string {
  let userStr = user.id

  let userPosId = userStr + "_" + marketId
  return userPosId
}

export function getOrCreateUserPosition(user: User, market: Market): UserPosition {
  let userPosId = formatUserPositionId(user, market.id)
  let userPosition = UserPosition.load(userPosId);
  if(!userPosition) {
    
    userPosition = new UserPosition(userPosId);
    userPosition.user = user.id
    userPosition.amountCollateral = zeroBD()
    userPosition.amountBorrowed = zeroBD()
    userPosition.amountLent = zeroBD()
    userPosition.lastUpdateBlocknumber = zeroBI()
    userPosition.lastUpdateTimestamp = zeroBI()
    userPosition.isExpired = false
    userPosition.rcTokenAmount = zeroBD()
    userPosition.rrTokenAmount = zeroBD()
    userPosition.borrowAPY = zeroBD()
    userPosition.lendingAPY = zeroBD()
    userPosition.currentPnL = zeroBD()
    userPosition.market = market.id

    let collateral = getOrCreateCollateral(Address.fromString(market.collateral))
    userPosition.initialCollateralPrice = get_asset_price_USD(Address.fromString(collateral.id))
    userPosition.save();
  }
  return userPosition as UserPosition;
}


export function getSystemState(block: BigInt, time: BigInt): SystemState {
  let state = SystemState.load('current')

  if (state == null) {
    state = new SystemState('current')

    state.totalDebt = zeroBD()

    state.totalCollateral = zeroBD()
    state.totalRepaid = zeroBD()
    state.totalDefaulted = zeroBD()
    state.totalFees = zeroBD()
    state.lastUpdateTimestamp = time
    state.lastUpdateBlocknumber = block
    state.save()
  }
  state.lastUpdateTimestamp = time
  state.lastUpdateBlocknumber = block
  state.save()
  return state as SystemState
}


export function getOrInitMetapool(address:Address,market:Market): Metapool{
  let metapool = Metapool.load(address.toHexString())
  if(!metapool){
    metapool = new Metapool(address.toHexString())
    metapool.market = market.id
    metapool.save()
  }
  return metapool as Metapool
}

/*
export function handleTrasnfer(event:Transfer){
}
*/