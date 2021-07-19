import { BigInt, BigDecimal, Bytes, ByteArray, crypto, log, Value, Address } from '@graphprotocol/graph-ts';
import { convertTokenAmountToDecimals,exponentToBigDecimal, exponentToBigInt,zeroBD,zeroBI } from "./converters"
import { get_asset_price_USD } from "../helper/initializer"
import { User, Collateral, PairedToken, Market } from "../../generated/schema"
import { CurvefiFactory } from '../../generated/metapool/CurvefiFactory'


export function calculatePremiumPerUnitCollateral(currentPrice: BigDecimal, mintRatio: BigInt): BigDecimal {
    // mintRatio * currentPrice
    let mintRat = convertTokenAmountToDecimals(mintRatio,18)
    let premium = mintRat.minus(currentPrice)
    return premium;
}


/*
export function calcInitMarketApy(currentTime: BigInt, expiry:BigInt, mintRatio: BigInt): BigDecimal {
    // mintRatio * currentPrice
    let mintRat = mintRatio.div(exponentToBigInt(18))
    let raw_interest = (BigInt.fromI32(100).minus(mintRat)).times(BigInt.fromI32(100)).toBigDecimal()
    let seconds = (expiry.minus(currentTime))

    let days = seconds.div(BigInt.fromI32(86400))
    let year = BigInt.fromI32(365).div(days)
    let apy = raw_interest.times(year.toBigDecimal())
    return apy;
}
*/
export function calculateInterestRate(type:String,currentTime: BigInt, expiry:BigInt,amountIn: BigDecimal,amountOut:BigDecimal): BigDecimal {
    let interestAmt = zeroBD();
    if (type == 'Lend'){
        interestAmt = amountOut.minus(amountIn)
    }else if (type == 'Borrow'){
        interestAmt = amountIn.minus(amountOut)
    }
    let rawInterest = (BigDecimal.fromString("100").times(interestAmt)).div(amountIn)
    let secondsToExpiry = expiry.minus(currentTime)
    let daysToExpiry = secondsToExpiry.div(BigInt.fromI32(86400))
    let yearMultiplier = BigInt.fromI32(365).div(daysToExpiry)
    return rawInterest.times(yearMultiplier.toBigDecimal())
}

export function getColAmtFromRTokenAmt(rTokenAmt: BigInt, colDecimals: u32, rTokenDecimals:u32, mintRatio: BigInt): BigInt {
    let colAmt = ((rTokenAmt.times(exponentToBigInt(colDecimals)).times(exponentToBigInt(18))).div(mintRatio)).div(exponentToBigInt(rTokenDecimals))
    return colAmt
}

export function getRTokenAmtFromColAmt(amount: BigInt, colDecimals: u32, pairedDecimals:u32, mintRatio: BigInt): BigInt {
        let rTokenAmt = ((amount.times(mintRatio).times(exponentToBigInt(pairedDecimals))).div(exponentToBigInt(colDecimals))).div(exponentToBigInt(18))
        return rTokenAmt
}




export function get_dy_underlying_borrow(address: Address,rcTokenAmt: BigInt): BigInt {
    let curveFactory = CurvefiFactory.bind(address)
    let dai_out = curveFactory.get_dy_underlying(zeroBI(),BigInt.fromI32(1),rcTokenAmt)
    return dai_out;
}

export function get_dy_underlying_lend(address: Address,pairedAmt: BigInt): BigInt {
    let curveFactory = CurvefiFactory.bind(address)
    let dai_out = curveFactory.get_dy_underlying(zeroBI(),BigInt.fromI32(1),pairedAmt)
    return dai_out;
}
  
