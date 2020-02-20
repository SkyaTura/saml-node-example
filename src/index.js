const dotenv = require('dotenv')
const {inspect} = require('util')
const express = require('express')
const JWT = require('jsonwebtoken')
const passport = require('passport')
const bodyParser = require('body-parser')
const SamlStrategy = require('passport-saml').Strategy

dotenv.config()

const log = (prefix, payload) => console.log(
  prefix,
  inspect(payload, false, Infinity, true)
)

// Classe para auxiliar a simular um banco de dados
class FakeDB {
  constructor() {
    this.users = []
  }
  fakeAssync(response) {
    // Método para simular uma requisição assíncrona
    return new Promise(resolve =>
      setTimeout(
        () => resolve(response),
        Math.random() * 300
      )
    )
  }
  find(payload) {
    const {nameID} = payload
    const user = this.users.find(item => item.nameID === nameID)
    return this.fakeAssync(user)
  }
  create(payload) {
    const id = this.users.length + 1
    const newUser = {...payload, id}
    this.users.push(newUser)
    return this.fakeAssync(newUser)
  }
  async findOrCreate(payload) {
    const user = await this.find(payload) || await this.create(payload)
    return this.fakeAssync(user)
  }
}
const Users = new FakeDB() // Instância do DB falso


// Configurações básicas do Express
const app = express()
app.use(bodyParser.urlencoded({extended: true}))

// Configurações básicas do Passport
app.use(passport.initialize())
app.use(passport.session())
passport.serializeUser((user, done) => done(null, user))
passport.deserializeUser((obj, done) => done(null, obj))

// Configurações da integração com o IDP SAML
const CALLBACK_PATH = '/' // Onde o passport irá tratar a autenticação
const samlOptions = {
  path: CALLBACK_PATH,
  entryPoint: process.env.SAML_ENTRYPOINT,
  issuer: process.env.SAML_ENTITY_ID,
  additionalParams: {
    metaAlias: process.env.SAML_META_ALIAS,
    spEntityID: process.env.SAML_ENTITY_ID
  }
}

const samlHandler = async (profile, done) => {
  log('Handler do passport', {profile})

  const user = await Users.findOrCreate(profile)
  if (!user) throw new Error(`Usuário não encontrado`)

  done(null, user)
}

passport.use(new SamlStrategy(samlOptions, samlHandler))

// Rotas
app.get('/', function (req, res) {
  res.send(`<html><body>Ola Mundo<br/><a href="/login/saml">Login</a></body></html>`)
})

app.get('/login/saml',
  passport.authenticate('saml', {failureRedirect: '/', failureFlash: true}),
  function (req, res) {
    res.redirect('/')
  }
)

app.post(CALLBACK_PATH,
  passport.authenticate('saml', {failureRedirect: '/', failureFlash: true}),
  function (req, res) {
    const {user} = req
    const jwt = JWT.sign(user, process.env.JWT_SECRET)

    log('Rota de Callback', {user, jwt})

    res.redirect(`https://spa.example.com/token-login?token=${jwt}`)
  }
)


var server = app.listen(3000)
console.log('Servidor express iniciado na porta %s', server.address().port)
