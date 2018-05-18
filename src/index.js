const {
  BaseKonnector,
  requestFactory,
  signin,
  scrape,
  saveBills,
  log
} = require('cozy-konnector-libs')
const request = requestFactory({
  // the debug mode shows all the details about http request and responses. Very usefull for
  // debugging but very verbose. That is why it is commented out by default
  // debug: true,
  // activates [cheerio](https://cheerio.js.org/) parsing on each page
  cheerio: true,
  // If cheerio is activated do not forget to deactivate json parsing (which is activated by
  // default in cozy-konnector-libs
  json: false,
  // this allows request-promise to keep cookies between requests
  jar: true
})

const baseUrl = 'https://www.inulogic.fr'

module.exports = new BaseKonnector(start)

// The start function is run by the BaseKonnector instance only when it got all the account
// information (fields). When you run this connector yourself in "standalone" mode or "dev" mode,
// the account information come from ./konnector-dev-config.json file
async function start(fields) {
  log('info', 'Authenticating ...')
  await authenticate(fields.email, fields.password)
  log('info', 'Successfully logged in')

  return Promise.resolve()
}

// this shows authentication using the [signin function](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_signin)
// even if this in another domain here, but it works as an example
function authenticate(email, password) {
  return signin({
    url: `${baseUrl}/se-connecter`,
    formSelector: 'form[action="/se-connecter"]',
    formData: { userNameOrEmail: email, password },
    // the validate function will check if
    validate: (statusCode, $) => {
      // The login in toscrape.com always works excepted when no password is set
      if ($(`a[href='/se-deconnecter']`).length === 1) {
        return true
      } else {
        // cozy-konnector-libs has its own logging function which format these logs with colors in
        // standalone and dev mode and as JSON in production mode
        $('.validation-summary-errors li')
          .map((i, el) => {
            return $(el)
              .text()
              .trim()
          })
          .get()
          .forEach(err => log('error', err))

        return false
      }
    }
  })
}
