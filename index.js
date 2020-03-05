/**
 * @author Jake Lees
 * @version 1.0.0
 */

const timeout = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Helper class to manage a mask for the SLAPI
 */
class SLAPIMask {
  constructor () {
    this._maskObj = Object.create(null)
  }

  get maskString () { return this.mask }
  get mask () { return this.toString() }

  /**
   * Remove a specific path from the mask.
   * If no parameter is given, then it will run on root.
   * @param {string} path Path to unset/clear
   * @returns {SLAPIMask} The current class instance for chaining purposes
   */
  unset (path = '') {
    if (path === '') this._maskObj = {}
    else {
      let shortenedKey = path.split('.')
      const target = shortenedKey.pop()
      shortenedKey = shortenedKey.join('.')

      const ref = shortenedKey === '' ? this._maskObj : this._getRef(shortenedKey)
      delete ref[target]
    }

    return this
  }

  /**
   * Set an object to a specific path in the mask
   * @param {object} [val={}] Object to assign
   * @param {string} [path=""] Where to assign the object
   * @returns {SLAPIMask} The current class instance for chaining purposes
   * @example
   *    // Current structure: {'prop1': {'subProp1': {}}, 'prop2': {}}
   *    mask.set({})
   *    // Same as running mask.unset()
   * @example
   *    // Current structure: {'prop1': {'subProp1': {}}, 'prop2': {}}
   *    mask.set({'prop1': {'subPropTest': {}}})
   *    // Mask after set: {'prop1': {'subPropTest'}}
   * @example
   *    // Current structure: {}
   *    mask.set({'subProp': {}}, 'nonExistentRootProp')
   *    // Mask after set: {'nonExistentRootProp': {'subProp': {}}}
   */
  set (val = {}, path = '') {
    this._checkKeys(val)

    if (path === '') this._maskObj = val
    else {
      let shortenedKey = path.split('.')
      const target = shortenedKey.pop()
      shortenedKey = shortenedKey.join('.')

      const ref = shortenedKey === '' ? this._maskObj : this._getRef(shortenedKey)
      ref[target] = val
    }

    return this
  }

  /**
   * Push a new prop into the mask. Chainable with other functions that return the class instance
   * @param {string} prop Property to be added to the mask
   * @param {string} path dot-delimited path of where to put the property
   * @example
   *    mask.push('keyInRoot')
   * @example
   *    mask.push('subKey', 'keyInRoot')
   * @example
   *    mask.push('subSubKey', 'keyInRoot.subKey')
   * @example
   *    mask.push('keyInRoot').push('subKey', 'keyInRoot').push('subSubKey', 'keyInRoot.subKey')
   * @returns {SLAPIMask} The current class instance for chaining purposes
   * @throws {Error} Throws an error if the provided property name isn't a string
   */
  push (prop, path = '') {
    if (
      !prop ||
      (
        typeof prop !== 'string' &&
        !Array.isArray(prop)
      )
    ) throw new Error('Invalid property/properties name/s')
    const tempObj = Object.create(null)

    if (Array.isArray(prop)) {
      for (let i = 0; i < prop.length; i++) {
        tempObj[prop[i]] = {}
      }
    } else tempObj[prop] = {}

    this.set(tempObj, path)

    return this
  }

  /**
   * Validates that no keys in the provided object contain a period in them.
   * @param {object} obj
   * @throws {SyntaxError}
   */
  _checkKeys (obj = {}) {
    const keys = Object.keys(obj)

    keys.map(key => {
      if (key.indexOf('.') > -1) throw new SyntaxError('Object keys cannot include periods')
      if (
        obj[key] &&
        obj[key].constructor === Object &&
        Object.keys(obj[key]).length > 0
      ) this._checkKeys(obj[key])
    }).join(',')
  }

  /**
   * Get a reference to the desired path in the mask
   * @param {string} key
   * @returns {object}
   */
  _getRef (path = '') {
    let ref = this._maskObj

    if (path !== '') {
      const hierarchyArr = path.split('.')

      for (let i = 0; i < hierarchyArr.length; i++) {
        const key = hierarchyArr[i]

        ref = ref[key]
        if (!ref) throw new ReferenceError(`"${key}" of path "${path}" doesn't exist in the current mask. (${this.toString()})`)
      }
    }

    return ref
  }

  /**
   * Converts an object to a mask string
   * @param {object} obj
   * @returns {string}
   */
  _objToStr (obj) {
    var res = []
    function recurse (obj, current) {
      for (var key in obj) {
        var value = obj[key]
        var newKey = (current ? current + '.' + key : key)
        if (value && typeof value === 'object' && Object.keys(value).length > 0) {
          recurse(value, newKey)
        } else {
          res.push(newKey)
        }
      }
    }

    recurse(obj)
    return res.join(',')
  }

  toString () { return `mask[${this._objToStr(this._maskObj)}]` }
}

/**
 * Class to interact with the internal softlayer API.
 * It should work on the customer API as well as it's just a wrapper for the
 * REST service, but it was designed for the internal API
 */
export class SLAPIRequest {
  results = {
    res: null,
    start: null,
    end: null
  }

  options = {
    offset: 0,
    limit: 25,
    filter: {},
    service: null,
    func: null,
    headers: new Headers(),
    body: new FormData(),
    method: 'get'
  }

  config = {
    endpoint: 'https://api.softlayer.com/rest/v3.1/',
    service: null,
    func: null
  }

  mask = new SLAPIMask()

  /**
   * @param {Object}    opts
   * @param {string}    opts.service  - Service to use
   * @param {string}    opts.func     - Function to call on service
   * @param {SLAPIMask} opts.mask     - objectMask to send to the API
   * @param {object}    opts.filter   - objectFilter to filter results
   * @param {string}    opts.username - Credentials
   * @param {string}    opts.password - Credentials
   */
  constructor (
    {
      service = 'SoftLayer_Hardware_Server',
      func = 'getObject',
      mask = new SLAPIMask(),
      filter = {},
      username,
      password
    } = {}
  ) {
    this.config.service = service
    this.config.func = func
    this.config.username = username
    this.config.password = password
    this.options.filter = filter
    this.mask = mask
  }

  /**
   * Get the bare URL without the query string
   */
  get url () {
    if (!this.config.service) throw new Error('Invalid service')
    if (!this.config.func) throw new Error('Invalid function')
    return `${this.config.endpoint}${this.config.service}/${this.config.func}`
  }

  /**
   * Compile the full url with mask, filter, and limit
   */
  get urlQuery () {
    if (!this.config.service) throw new Error('Invalid service')
    if (!this.config.func) throw new Error('Invalid function')

    const mask = this.mask.maskString
    const filter = JSON.stringify(this.options.filter)

    const params = new URLSearchParams()
    if (mask !== 'mask[]') params.set('objectMask', mask)
    if (filter !== '{}') params.set('objectFilter', filter)
    params.set('resultLimit', `${this.options.offset},${this.options.limit}`)

    return `${this.config.endpoint}${this.config.service}/${this.config.func}?${params.toString()}`
  }

  /**
   * Get the total number of items from an already ran query
   */
  get totalItems () {
    if (!this.results.res) return NaN

    return this.results.res.headers.get('SoftLayer-Total-Items') || 0
  }

  /**
   * Get how long the request took
   */
  get duration () {
    return `${this.results.end - this.results.start}ms`
  }

  /**
   * @param {string} username
   */
  set username (username) {
    this.config.username = username
  }

  /**
   * @param {string} password
   */
  set password (password) {
    this.config.password = password
  }

  endpoint (endpoint = 'https://api.softlayer.com/rest/v3.1/') {
    this.config.endpoint = endpoint
    return this
  }

  /**
   * Chainable function to change or reset the function
   * @param {string} func
   */
  function (func = 'getObject') {
    this.config.func = func
    return this
  }

  /**
   * Chainable function to change or reset the service
   * @param {string} val
   */
  service (val = 'SoftLayer_Hardware_Server') {
    this.config.service = val
    return this
  }

  /**
   * Chainable function to change or reset the filter
   * @param {object} filter
   */
  filter (filter = {}) {
    this.options.filter = filter
    return this
  }

  /**
   * Convenience alias for this.filter
   * @param {object} filter Filter object
   */
  search (filter = {}) {
    return this.filter(filter)
  }

  /**
   * Chainable function to change or reset the limit
   * @param {number} limit
   */
  limit (limit = 25) {
    this.options.limit = limit
    return this
  }

  /**
   * Chainable function to change or reset the offset
   * @param {number} offset
   */
  offset (offset = 0) {
    this.options.offset = offset
    return this
  }

  /**
   * Chainable function to change or reset the page
   * @param {number} page
   */
  page (page = 1) {
    this.options.offset = (page - 1) * this.options.limit
    return this
  }

  /**
   * Chainable function to change or reset the method
   * @param {string} method
   */
  method (method = 'get') {
    this.options.method = method
    return this
  }

  /**
   * Chainable function to change or reset the body
   * @param {FormData} body
   */
  body (body = new FormData()) {
    this.options.body = body
    return this
  }

  /**
   *
   * @param {SLAPIRequest} [_this=this] Reference of the class
   * @returns {Array} Object array of all the results of the query
   */
  async exec (_this = this) {
    if (
      !_this.config.username ||
      !_this.config.password
    ) return new Error('Invalid API token')

    _this.results.start = Date.now()

    let url = _this.urlQuery
    let body
    const method = _this.options.method || 'get'

    const authString = `${_this.config.username}:${_this.config.password}`

    _this.options.headers.set('Authorization', `Basic ${btoa(authString)}`)

    if (method.toLocaleLowerCase() === 'post') {
      url = _this.url
      body = _this.options.body
    }

    _this.results.res = await fetch(url, {
      headers: _this.options.headers,
      method: method,
      body: body,
      mode: 'cors',
      credentials: 'include'
    })

    _this.results.end = Date.now()

    const result = await _this.results.res.json()
    return result
  }

  /**
   * Retrieve multiple pages worth of data from the API
   * @param {number} [pages=1] Number of pages to get
   */
  async getNumOfPages (pages = 1) {
    const resArr = []
    for (let i = 1; i <= pages; i++) {
      this.page(i)
      const res = await this.exec(this)
      resArr.push(res)
      console.log(`Retrieved page ${i} of ${pages} in ${this.duration}`)
      await timeout()
    }

    this.resArr = [].concat.apply([], resArr)

    return this.resArr
  }

  /**
   * Login to the API and retrieve a temporary API access token using employee
   * using employee credentials
   * @param {string} username SLEmployee username
   * @param {string} password SLEmployee password
   * @param {string} token VIP Access token
   */
  async employeeLogin (username, password, token) {
    if (!username || !password || !token) throw new Error('Missing login credentials')

    const apiCall = new SLAPIRequest({
      service: 'SoftLayer_User_Employee',
      func: 'getEncryptedSessionToken',
      username,
      password
    })

    const body = new FormData()

    body.append('remoteToken', token)

    apiCall.method('post').body(body)

    const res = await apiCall.exec()

    if (res.error) throw new Error(res.error)

    this.username = res.userId
    this.password = res.hash

    return this
  }
}
