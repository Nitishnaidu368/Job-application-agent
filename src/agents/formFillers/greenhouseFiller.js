const { LeverFiller } = require('./leverFiller');

// Greenhouse-specific field detection (IDs like #first_name, #last_name) lives in
// browserFillEngine.js's detectGreenhouse(), so no Node-side override is needed here.
class GreenhouseFiller extends LeverFiller { }

module.exports = { GreenhouseFiller };
