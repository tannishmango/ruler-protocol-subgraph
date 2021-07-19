import { Address, BigDecimal, BigInt, Bytes, ethereum, log } from '@graphprotocol/graph-ts';
import {
  Transfer
} from "../generated/RulerToken/RulerToken"
import { Swap, Mint, Burn, Sync } from '../generated/RulerSushiLP/RulerSushiLP'
//import { Deposit, Withdraw } from '../generated/RulerMining/RulerMining'
import {Deposit, MarketMakeDeposit, Collect, Redeem, Repay, FlashLoan, RTokenCreated, PairAdded, PairAdded__Params, RERC20ImplUpdated__Params} from '../generated/RulerCore/RulerCore'
import { RepayEvent, Metapool, PairedToken } from "../generated/schema"
import { Market,  Collateral, User, CollectEvent, RedeemEvent, MarketMakeDepositEvent, DepositEvent, FlashloanEvent } from "../generated/schema"
import { CurvefiFactory, TokenExchangeUnderlying } from '../generated/templates/CurvefiFactory/CurvefiFactory'
import { getOrInitUser, getOrCreateCollateral, getOrCreatePairedToken, createMarket, initMarket, getSystemState, get_asset_price_USD, convert_asset_amt_USD,getOrCreateUserPosition, getMarket,getOrInitMetapool } from "./helper/initializer"
import { calculatePremiumPerUnitCollateral,calculateInterestRate,get_dy_underlying_lend,get_dy_underlying_borrow,getColAmtFromRTokenAmt,getRTokenAmtFromColAmt } from "./utils/maths"
import { convertTokenAmountToDecimals, exponentToBigInt, exponentToBigDecimal, zeroBD, zeroBI } from './utils/converters';
import { RulerCore } from '../generated/RulerCore/RulerCore'
import { ORACLE_ADDRESS, RULER_CORE_ADDRESS, ZERO_ADDRESS} from "./utils/constants"
import {DepositAndSwapWithCurveCall,DepositWithPermitAndSwapWithCurveCall } from '../generated/RulerZap/RulerZap'


/*
lending thru curve factory. 
lender gets rctokens to collect loan payments after expiry
*/

export function handleTokenExchangeUnderlying(event: TokenExchangeUnderlying): void{
    let metapool = Metapool.load(event.address.toHexString())
    if(!metapool){
        return 
    }
    if(event.params.sold_id == BigInt.fromI32(1)){
        //lending
        let user = getOrInitUser(event.params.buyer)
        let marketEnt = Market.load(metapool.market)
        if (!marketEnt){
            return
        }
        
        let collateral =  Collateral.load(marketEnt.collateral)//getOrCreateCollateral(Address.fromString(market.collateral))//Collateral.load(market.collateral)
        
        let paired = PairedToken.load(marketEnt.pairedToken)
        if(paired == null || collateral == null){
            return
        }else{
            let pairedId = paired.id
            let pairedToken = getOrCreatePairedToken(Address.fromString(pairedId))
            let collatId = collateral.id
            let collateralToken = getOrCreateCollateral(Address.fromString(collatId))
            let expiry = marketEnt.expiry
            let mintRatio = marketEnt.mintRatio
            let market = getMarket(collateralToken,pairedToken,expiry,BigInt.fromString(mintRatio.toString()))
            let userPosition = getOrCreateUserPosition(user,market)
            let rtokenDecimals = paired.decimals
            let rcTokenAmt = event.params.tokens_bought
            let pairedLent = event.params.tokens_sold
    
            // decimalize return values
            let pairedAmtDecimalized = convertTokenAmountToDecimals(pairedLent,paired.decimals)
            let rcTokenAmtDecimalized = convertTokenAmountToDecimals(rcTokenAmt,rtokenDecimals)
    
            let blocknumber = event.block.number
            let time = event.block.timestamp
    
            let lenderAPY = calculateInterestRate("Lend",time,expiry,pairedAmtDecimalized,rcTokenAmtDecimalized)
    
            let price_usd = get_asset_price_USD(Address.fromString(collateral.id))

            userPosition.rcTokenAmount = userPosition.rcTokenAmount.plus(rcTokenAmtDecimalized)
            userPosition.lendingAPY = lenderAPY
            userPosition.currentPnL = rcTokenAmtDecimalized.minus(pairedAmtDecimalized)
            userPosition.amountLent = userPosition.amountLent.plus(pairedAmtDecimalized)
            userPosition.lastUpdateBlocknumber = blocknumber
            userPosition.lastUpdateTimestamp = time
    
    
            // calculations for updating market current borrowing apy as well
            let borrow_pair_received = get_dy_underlying_borrow(Address.fromString(metapool.id),rcTokenAmt)
            let borrow_pair_received_decimalized = convertTokenAmountToDecimals(borrow_pair_received,paired.decimals)
            market.borrowAPY = calculateInterestRate("Borrow",time,expiry,rcTokenAmt.toBigDecimal(),borrow_pair_received_decimalized)
            market.lendingAPY = lenderAPY
            //market.totalCollateral = market.totalCollateral.plus(collateralAmount)
            market.totalLenders = market.totalLenders.plus(BigInt.fromI32(1))
            market.premiumPerCollateralLent = calculatePremiumPerUnitCollateral(price_usd,BigInt.fromString(mintRatio.toString()).times(exponentToBigInt(18)))
            market.lastUpdateBlocknumber = blocknumber
            market.lastUpdateTimestamp = time
            market.save()
          
          
            collateral.priceUSD = price_usd
            collateral.save()
        }



    }
}


/*
event TokenExchangeUnderlying:
    buyer: indexed(address)
    sold_id: int128
    tokens_sold: uint256
    bought_id: int128
    tokens_bought: uint256

*/