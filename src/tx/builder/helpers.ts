import BigNumber from 'bignumber.js'
import { hash, salt } from '../../utils/crypto'
import { encode, decode, EncodedData, EncodingType } from '../../utils/encoder'
import { toBytes } from '../../utils/bytes'
import { concatBuffers } from '../../utils/other'
import {
  ID_TAG_PREFIX,
  PREFIX_ID_TAG,
  NAME_BID_RANGES,
  NAME_FEE_BID_INCREMENT,
  NAME_BID_TIMEOUT_BLOCKS,
  NAME_MAX_LENGTH_FEE,
  POINTER_KEY_BY_PREFIX
} from './constants'
import { ceil } from '../../utils/bignumber'
import {
  TagNotFoundError,
  PrefixNotFoundError,
  IllegalBidFeeError,
  ArgumentError
} from '../../utils/errors'
import { AensName } from '../../chain'

/**
 * JavaScript-based Transaction builder helper function's
 */

export const createSalt = salt

export { encode, decode }

export interface Pointer {
  key: string
  id: string
}

/**
 * Build a contract public key
 * @param ownerId - The public key of the owner account
 * @param nonce - the nonce of the transaction
 * @returns Contract public key
 */
export function buildContractId (ownerId: EncodedData<'ak'>, nonce: number | BigNumber): EncodedData<'ct'> {
  const ownerIdAndNonce = Buffer.from([...decode(ownerId), ...toBytes(nonce)])
  const b2bHash = hash(ownerIdAndNonce)
  return encode(b2bHash, 'ct')
}

/**
 * Build a oracle query id
 * @param senderId - The public key of the sender account
 * @param nonce - the nonce of the transaction
 * @param oracleId - The oracle public key
 * @returns Contract public key
 */
export function oracleQueryId (
  senderId: EncodedData<'ak'>,
  nonce: number | BigNumber | string,
  oracleId: EncodedData<'ok'>
): EncodedData<'oq'> {
  function _int32 (val: number | string | BigNumber): Buffer {
    const nonceBE = toBytes(val, true)
    return concatBuffers([Buffer.alloc(32 - nonceBE.length), nonceBE])
  }

  const b2bHash = hash(
    Buffer.from([...decode(senderId), ..._int32(nonce), ...decode(oracleId)]))
  return encode(b2bHash, 'oq')
}

/**
 * Format the salt into a 64-byte hex string
 * @param salt - Random number
 * @returns Zero-padded hex string of salt
 */
export function formatSalt (salt: number): Buffer {
  return Buffer.from(salt.toString(16).padStart(64, '0'), 'hex')
}

/**
 * Encode an AENS name
 *
 * @param name - Name to encode
 * @returns `nm_` prefixed encoded AENS name
 */
export function produceNameId (name: AensName): EncodedData<'nm'> {
  return encode(hash(name.toLowerCase()), 'nm')
}

/**
 * Generate the commitment hash by hashing the formatted salt and
 * name, base 58 encoding the result and prepending 'cm_'
 *
 * @param name - Name to be registered
 * @param salt - Random salt
 * @returns Commitment hash
 */
export function commitmentHash (name: AensName, salt: number = createSalt()): EncodedData<'cm'> {
  return encode(hash(concatBuffers([Buffer.from(name.toLowerCase()), formatSalt(salt)])), 'cm')
}

/**
 * Utility function to create and _id type
 * @param hashId - Encoded hash
 * @returns Buffer Buffer with ID tag and decoded HASh
 */
export function writeId (hashId: string): Buffer {
  if (typeof hashId !== 'string') throw new ArgumentError('hashId', 'a string', hashId)
  const prefix = hashId.slice(0, 2) as keyof typeof PREFIX_ID_TAG
  const idTag = PREFIX_ID_TAG[prefix]
  if (idTag == null) throw new TagNotFoundError(prefix)
  return Buffer.from([...toBytes(idTag), ...decode(hashId as EncodedData<EncodingType>)])
}

/**
 * Utility function to read and _id type
 * @param buf - Data
 * @returns Encoided hash string with prefix
 */
export function readId (buf: Buffer): string {
  const tag = Buffer.from(buf).readUIntBE(0, 1)
  const prefix = ID_TAG_PREFIX[tag]
  if (prefix == null) throw new PrefixNotFoundError(tag)
  return encode(buf.slice(1, buf.length), prefix)
}

/**
 * Utility function to convert int to bytes
 * @param val - Value
 * @returns Buffer Buffer from number(BigEndian)
 */
export function writeInt (val: number | string | BigNumber): Buffer {
  return toBytes(val, true)
}

/**
 * Utility function to convert bytes to int
 * @param buf - Value
 * @returns Buffer Buffer from number(BigEndian)
 */
export function readInt (buf: Buffer = Buffer.from([])): string {
  return new BigNumber(Buffer.from(buf).toString('hex'), 16).toString(10)
}

/**
 * Helper function to build pointers for name update TX
 * @param pointers - Array of pointers
 * `([ { key: 'account_pubkey', id: 'ak_32klj5j23k23j5423l434l2j3423'} ])`
 * @returns Serialized pointers array
 */
export function buildPointers (pointers: Pointer[]): Buffer[][] {
  return pointers.map(
    p => [
      toBytes(p.key),
      writeId(p.id)
    ]
  )
}

/**
 * Helper function to read pointers from name update TX
 * @param pointers - Array of pointers
 * @returns Deserialize pointer array
 */
export function readPointers (pointers: Array<[key: string, id: Buffer]>): Pointer[] {
  return pointers.map(
    ([key, id]) => Object.assign({
      key: key.toString(),
      id: readId(id)
    })
  )
}

const AENS_SUFFIX = '.chain'

/**
 * Is AENS name valid
 * @param name - AENS name
 */
export function isNameValid (name: string): boolean {
  // TODO: probably there are stronger requirements
  return name.endsWith(AENS_SUFFIX)
}

/**
 * @param identifier - account/oracle/contract address, or channel
 * @returns default AENS pointer key
 */
export function getDefaultPointerKey (
  identifier: EncodedData<keyof typeof POINTER_KEY_BY_PREFIX>
): POINTER_KEY_BY_PREFIX {
  decode(identifier)
  const prefix = identifier.substring(0, 2) as keyof typeof POINTER_KEY_BY_PREFIX
  return POINTER_KEY_BY_PREFIX[prefix]
}

/**
 * Get the minimum AENS name fee
 *
 * @param name - the AENS name to get the fee for
 * @returns the minimum fee for the AENS name auction
 */
export function getMinimumNameFee (name: AensName): BigNumber {
  const nameLength = name.length - AENS_SUFFIX.length
  return NAME_BID_RANGES[Math.min(nameLength, NAME_MAX_LENGTH_FEE)]
}

/**
 * Compute bid fee for AENS auction
 *
 * @param name - the AENS name to get the fee for
 * @param startFee - Auction start fee
 * @param increment - Bid multiplier(In percentage, must be between 0 and 1)
 * @returns Bid fee
 */
export function computeBidFee (
  name: AensName,
  startFee: number | string | null,
  increment: number = NAME_FEE_BID_INCREMENT
): BigNumber {
  if (!(Number(increment) === increment && increment % 1 !== 0)) throw new IllegalBidFeeError(`Increment must be float. Current increment ${increment}`)
  if (increment < NAME_FEE_BID_INCREMENT) throw new IllegalBidFeeError(`minimum increment percentage is ${NAME_FEE_BID_INCREMENT}`)
  return ceil(
    new BigNumber(startFee ?? getMinimumNameFee(name))
      .times(new BigNumber(NAME_FEE_BID_INCREMENT).plus(1))
  )
}

/**
 * Compute auction end height
 *
 * @param name - Name to compute auction end for
 * @param claimHeight - Auction starting height
 * @see {@link https://github.com/aeternity/aeternity/blob/72e440b8731422e335f879a31ecbbee7ac23a1cf/apps/aecore/src/aec_governance.erl#L273}
 * @returns Auction end height
 */
export function computeAuctionEndBlock (name: AensName, claimHeight: number): number {
  const length = name.length - AENS_SUFFIX.length
  const h = (length <= 4 && 62 * NAME_BID_TIMEOUT_BLOCKS) ||
    (length <= 8 && 31 * NAME_BID_TIMEOUT_BLOCKS) ||
    (length <= 12 && NAME_BID_TIMEOUT_BLOCKS) ||
    0
  return h + claimHeight
}

/**
 * Is name accept going to auction
 */
export function isAuctionName (name: AensName): boolean {
  return name.length < 13 + AENS_SUFFIX.length
}
