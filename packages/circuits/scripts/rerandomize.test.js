const { genKeypair } = require('./keypair')
const { encodeToMessage, encrypt, decrypt, rerandomize } = require('./rerandomize')

const key = genKeypair(18987800137691794779670755126650543745980927534157034367966466164161995818621n)

const d = 
[
  "17251333889042108248217396875481671513663712966395561711829497049177468279452",
  "13338774215360473033060180835528569667419068936312737497967546726624980655175",
  "4059088980925957534657116540710024906397255799563077765452333940100605769078",
  "479572667423003939482853960593277678343026568050856583334682928815120126096",
  "381144576445537372733326520625307630135775030295804333525104496460949178457"
]
// [
//   "0",
//   "0",
//   "0",
//   "0",
//   "0"
// ]


const decrypted = decrypt(key.formatedPrivKey, {
  c1: {
    x: BigInt(d[0]),
    y: BigInt(d[1]),
  },
  c2: {
    x: BigInt(d[2]),
    y: BigInt(d[3]),
  },
  xIncrement: 0n
})

// const encrypted = encrypt(111222000n, key.pubKey)

// const decrypted = decrypt(key.formatedPrivKey, encrypted)


// const reranded = rerandomize(key.pubKey, encrypted)

// const decrypted2 = decrypt(key.formatedPrivKey, reranded)

// console.log(encrypted, reranded)
console.log(decrypted)

