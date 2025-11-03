const fs = require('fs')
const { stringizing, genKeypair } = require('./keypair')
const { genMessage } = require('./client')


const USER_1 = 0        // state leaf idx
const USER_2 = 1        // state leaf idx

const privateKeys = [
  111111n, // coordinator
  222222n, // user 1
  333333n, // share key for message 1
  444444n, // share key for message 2
  555555n, // user 2
  666666n, // share key for message 3
]
const coordinator = genKeypair(privateKeys[0])
const user1 = genKeypair(privateKeys[1])
const user2 = genKeypair(privateKeys[4])

const enc1 = genKeypair(privateKeys[2])
const message1 = genMessage(enc1.privKey, coordinator.pubKey)(
  USER_1, 2, 12, 8, user1.pubKey, user1.privKey, 1234567890n
)
console.log(message1.length)
const enc2 = genKeypair(privateKeys[5])
const message2 = genMessage(enc2.privKey, coordinator.pubKey)(
  USER_2, 1, 8, 5, user2.pubKey, user2.privKey, 1234567890n
)

fs.writeFileSync('./messages.temp.json', JSON.stringify(stringizing(new Array(50).fill([message1]))))
fs.writeFileSync('./pubkeys.temp.json', JSON.stringify(stringizing(new Array(50).fill(enc1.pubKey))))
