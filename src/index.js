const {
  BaseKonnector,
  requestFactory,
  signin,
  scrape,
  saveBills,
  log
} = require('cozy-konnector-libs')
const pdf = require('pdfjs')
const html2pdf = require('./html2pdf')
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

  log('info', 'Retrieving bills ...')
  const $ = await request(`${baseUrl}/zone_client/factures`)
  const bills = await getBills($)
  log('info', 'Successfully retrieved bills')

  log('info', 'Saving bills to Cozy ...')
  await saveBills(bills, fields.folderPath, {
    identifiers: ['inulogic']
  })
  log('info', 'Saved bills to Cozy')
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

async function getBills($) {
  const $rows = $('table tbody tr')
  const bills = await Promise.all($rows.map((i, el) => getBill($(el))).get())

  return bills
}

async function getBill($row) {
  const date = getDate($row)
  const { amount, currency } = getAmountAndCurrency($row)
  const invoiceNumber = getInvoiceNumber($row)

  const bill = {
    vendor: 'Inulogic',
    date,
    amount,
    currency,
    filename: getFilename(date, amount, invoiceNumber)
  }

  bill.filestream = await billURLToStream(getFileUrl(invoiceNumber))

  return bill
}

function getDate($row) {
  const [year, month, day] = $row
    .find('td:nth-child(2)')
    .text()
    .trim()
    .split('/')
    .reverse()

  return new Date(year, month - 1, day)
}

function getAmountAndCurrency($row) {
  const [rawAmount, currency] = $row
    .find('td:nth-child(4)')
    .text()
    .trim()
    .split(' ')
  const amount = parseFloat(rawAmount.replace(',', '.'))

  return { amount, currency }
}

function getInvoiceNumber($row) {
  const invoiceNumber = $row
    .find('td:first-child')
    .text()
    .trim()

  return invoiceNumber
}

// TODO utiliser html2pdf (voir avec Christophe)
function getFileUrl(invoiceNumber) {
  const url = `${baseUrl}/zone_client/Invoice/Details?number=${invoiceNumber}`

  return url
}

function getFilename(date, amount, invoiceNumber) {
  const amountStr = `${amount}`.replace('.', '-')

  return `${date.toISOString()}_${amountStr}_${invoiceNumber}.pdf`
}

async function billURLToStream(url) {
  const doc = new pdf.Document()
  const $ = repairDocument(await request(url))
  html2pdf($, doc, $('#facture'), { baseURL: url })
  doc.end()
  return doc
}

// For now, html2pdf throws an error when some <td>s are missing
// Since we know that the tables rows contains a maximum of 4 <td>
// we compute the number of missing <td> and we add one with a colspan
// to fill the hole #truelle
function repairDocument($) {
  const $rows = $('tr')
  const NB_TDS_REQUIRED = 4

  $rows.each((i, el) => {
    const $el = $(el)
    const $tds = $el.find('td')

    let nbTds = 0
    $tds.each((i, el) => {
      const colspan = parseInt($(el).attr('colspan'))
      nbTds += isNaN(colspan) ? 1 : colspan
    })

    const nbMissingTds = NB_TDS_REQUIRED - nbTds

    if (nbMissingTds > 0) {
      $el
        .find('td')
        .first()
        .before(`<td colspan="${nbMissingTds}"></td>`)
    }
  })

  return $
}
