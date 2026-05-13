import type { Sector, Commodity, MarketSymbol } from '@/types';
import cryptoConfig from '../../shared/crypto.json';
import sectorConfig from '../../shared/sectors.json';
import commodityConfig from '../../shared/commodities.json';
import stocksConfig from '../../shared/stocks.json';
import stocksConfigGeopolJp from '../../shared/stocks-geopol-jp.json';
import { SITE_VARIANT } from './variant';

export const SECTORS: Sector[] = sectorConfig.sectors as Sector[];

export const COMMODITIES: Commodity[] = commodityConfig.commodities as Commodity[];

// Variant-aware stocks. The geopol-jp variant ships a superset that includes
// Japanese oil equities (INPEX, ENEOS, 出光, コスモ, JAPEX), JP gas utilities,
// trading houses (sōgō shōsha), JP indices, and JP-relevant FX pairs.
const activeStocksConfig = SITE_VARIANT === 'geopol-jp'
  ? stocksConfigGeopolJp
  : stocksConfig;

export const MARKET_SYMBOLS: MarketSymbol[] = activeStocksConfig.symbols as MarketSymbol[];

export const CRYPTO_IDS = cryptoConfig.ids as readonly string[];
export const CRYPTO_MAP: Record<string, { name: string; symbol: string }> = cryptoConfig.meta;
