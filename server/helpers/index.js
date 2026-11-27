// @ts-check

import _ from 'lodash';

// Dates follow the reference project: the format does not depend on the server locale.
const DATE_LOCALE = 'en-US';

export const formatDate = (value) => new Date(value).toLocaleString(DATE_LOCALE);

export const getAlertClass = (type) => {
  switch (type) {
    case 'error':
      return 'border-red-300 bg-red-50 text-red-900';
    case 'success':
      return 'border-green-300 bg-green-50 text-green-900';
    case 'info':
      return 'border-blue-300 bg-blue-50 text-blue-900';
    default:
      throw new Error(`Unknown flash type: '${type}'`);
  }
};

export default (app) => ({
  route(name, params) {
    return app.reverse(name, params);
  },
  _,
  getAlertClass,
  formatDate,
});
