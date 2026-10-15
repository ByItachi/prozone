import type { ShopConfig } from './ui';

const LEVELS = ['All Levels', 'PLATINUM', 'CLASSIC', 'PREMIUM', 'STANDARD', 'TITANIUM', 'BUSINESS', 'WORLD', 'GOLD', 'CORPORATE', 'GIFT', 'BLACK', 'GREEN', 'SILVER', 'ELECTRON', 'INFINITE', 'SIGNATURE', 'VIRTUAL', 'PREPAID'];
const COUNTRIES = ['All Countries', 'US-United States', 'DE-Germany', 'GB-United Kingdom', 'TR-Turkey', 'FR-France', 'IT-Italy', 'ES-Spain', 'CA-Canada', 'AU-Australia', 'RU-Russia', 'UA-Ukraine', 'CN-China', 'IN-India', 'BR-Brazil'];
const BRANDS = ['All Brands', 'VISA', 'MASTERCARD', 'AMERICAN EXPRESS', 'DISCOVER', 'DINERS CLUB', 'JCB', 'MAESTRO', 'MIR', 'RUPAY', 'UNIONPAY'];
const TYPES = ['All Types', 'DEBIT', 'CREDIT', 'PREPAID', 'GIFT'];
const BASES = ['All Bases', '⭐ WORLD MIX VERY HIGH QUALITY', '⭐ OLD BASES REFUNDABLE', 'SNIFF US WORLD MIX'];

export const SHOP_CONFIGS: Record<string, ShopConfig> = {
  'cvv': {
    title: 'CVV',
    sourceCategories: ['cvv', 'credit-cards'],
    tabs: [],
    preorder: true,
    fields: [
      { name: 'shops', label: 'Shops', type: 'select', options: ['⭐ Prozone VIP'], accent: true },
      { name: 'sellers', label: 'Sellers', type: 'select', options: ['Unavailable'], accent: true },
      { name: 'city', label: 'City', type: 'text', placeholder: 'City' },
      { name: 'expiry', label: 'Expiration date', type: 'text', placeholder: 'Expiry (YYMM)' },
      { name: 'zip', label: 'ZIP', type: 'textarea', placeholder: '10001,90001,95912,...' },
      { name: 'level', label: 'Level', type: 'select', options: LEVELS },
      { name: 'country', label: 'Country', type: 'select', options: COUNTRIES },
      { name: 'brand', label: 'Brand', type: 'select', options: BRANDS },
      { name: 'bins', label: 'Bins', type: 'textarea', placeholder: '601100,492181,...' },
      { name: 'bank', label: 'Bank Name', type: 'bank' },
      { name: 'state', label: 'State', type: 'select', options: ['All States'] },
      { name: 'type', label: 'Type', type: 'select', options: TYPES },
      { name: 'ext', label: 'Extended Options', type: 'select', options: ['Please select'] },
      { name: 'bases', label: 'Bases', type: 'select', options: BASES },
      { name: 'binPrice', label: 'BIN Price range', type: 'range', rangeLabel: '$0 - $100' },
      { name: 'cvr', label: 'CVR range', type: 'range', rangeLabel: '0% - 100%' },
    ],
    searchClear: { refresh: true },
    hideFilter: true,
    leftAction: 'BIN PREORDER',
    rightAction: 'BUY SELECTED',
    table: {
      columns: ['BIN', 'Exp Date', 'First name', 'Country', 'State', 'City', 'ZIP', 'Info', 'Address', 'BIN Info', 'Base', 'Valid %', 'Refundable', 'Price'],
      selectAll: true,
    },
  },

  ssn: {
    title: 'SSN SHOP',
    priceBadge: 'Price: 2,50$',
    tabs: ['SINGLE SEARCH', 'MULTI SEARCH'],
    fields: [
      { name: 'firstName', label: 'First name', type: 'text', placeholder: 'First name' },
      { name: 'lastName', label: 'Last name', type: 'text', placeholder: 'Last name' },
      { name: 'stype', label: 'Select type', type: 'select', options: ['Please select', 'SSN', 'DOB', 'Phone'] },
      { name: 'value', label: 'Value', type: 'text', placeholder: 'Value' },
    ],
    searchClear: {},
    emptyMessage: 'Please Search For Results',
  },

  checkers: {
    title: 'CHECK',
    priceBadge: 'Price: 0,30$',
    tabs: ['SINGE CHECK', 'BATCH CHECK'],
    fields: [
      { name: 'cc', label: 'CC Num', type: 'text', placeholder: 'CC Num', required: true },
      { name: 'exp', label: 'Exp. (MM/YY)', type: 'text', placeholder: 'Exp. (MM/YY)', required: true },
      { name: 'cvv2', label: 'CVV2', type: 'text', placeholder: 'CVV2' },
      { name: 'address', label: 'Address', type: 'text', placeholder: 'Address' },
      { name: 'zip', label: 'ZIP', type: 'text', placeholder: 'ZIP' },
      { name: 'provider', label: 'Provider', type: 'select', options: ['⭐ Select Provider'], accent: true },
      { name: 'avs', label: 'AVS', type: 'text' },
    ],
    searchClear: {
      leftInfo: 'Authorization Codes Information',
      extra: [
        {
          label: 'Authorize',
          tooltip: [
            'Standard Authorization Request',
            'No charge',
            'May hold an amount up to 30 days depends on issuer bank',
            'Most reliable method',
          ],
        },
        {
          label: 'Zero Check',
          tooltip: [
            'Check if an account is open for use',
            'Checking by lost / stolen lists',
            'No charge, no hold',
            'Less reliable method than Standard Authorization Request',
          ],
        },
      ],
      clearLabel: 'Clear',
    },
    table: { columns: ['Time', 'CC Num', 'Exp. (MM/YY)', 'CVV2', 'Provider', 'Address', 'ZIP', 'AVS', 'Type', 'Status'] },
  },

  dumps: {
    title: 'DUMPS',
    fields: [
      { name: 'bank', label: 'Bank name', type: 'select', options: ['Please select'] },
      { name: 'level', label: 'Level', type: 'select', options: ['Please select', ...LEVELS.slice(1)] },
      { name: 'type', label: 'Type', type: 'select', options: ['Please select', ...TYPES.slice(1)] },
      { name: 'bins', label: 'Bins', type: 'textarea', placeholder: 'One BIN Maximum' },
      { name: 'city', label: 'City', type: 'select', options: ['Please select'] },
      { name: 'country', label: 'Country', type: 'select', options: ['Please select'] },
      { name: 'state', label: 'State', type: 'select', options: ['Please select'] },
      { name: 'svc', label: 'SVC', type: 'select', options: ['Please select'] },
    ],
    searchClear: { refresh: true },
    table: { columns: ['BIN', 'SVC', 'MM', 'YY', 'Country', 'Bank', 'Level', 'Type', 'Address', 'T1', 'ZIP', 'Refundable', 'Price'] },
  },

  'sms-activate': {
    title: 'SMS ACTIVATE',
    fields: [
      { name: 'service', label: 'Service', type: 'select', options: ['Please select'] },
      { name: 'country', label: 'Country', type: 'select', options: ['Please select'] },
      { name: 'note', label: 'Note', type: 'text', placeholder: 'Enter some note' },
    ],
    rightAction: 'BUY NUMBER',
    table: { columns: ['Status', 'Phone', 'Note', 'Messages'] },
  },

  flooders: {
    title: 'FLOODERS',
    fields: [
      { name: 'service', label: 'Service', type: 'select', options: ['Please select'] },
      { name: 'country', label: 'Country', type: 'select', options: ['Please select'] },
      { name: 'note', label: 'Note', type: 'text', placeholder: 'Enter some note' },
    ],
    rightAction: 'BUY NUMBER',
    table: { columns: ['Status', 'Phone', 'Note', 'Calls'] },
  },

  proxies: {
    title: 'PROXIES',
    tabs: ['PROZONE VIP', 'PROZONE LUXURY'],
    fields: [
      { name: 'country', label: 'Country', type: 'select', options: ['US (28695)', 'All'] },
      { name: 'state', label: 'State', type: 'select', options: ['All'] },
      { name: 'city', label: 'City', type: 'text', placeholder: 'City' },
      { name: 'isp', label: 'ISP', type: 'text', placeholder: 'ISP' },
      { name: 'zip', label: 'ZIP', type: 'text', placeholder: 'ZIP' },
      { name: 'radius', label: 'ZIP Radius', type: 'select', options: ['All'] },
      { name: 'type', label: 'Type', type: 'select', options: ['All'] },
      { name: 'added', label: 'Added', type: 'select', options: ['All'] },
    ],
    searchClear: {},
    table: { columns: ['IP', 'Domain', 'DNS', 'Type', 'Speed', 'PING', 'Country', 'State', 'City', 'ZIP', 'Price'] },
  },

  'banks_and_accounts': {
    title: 'BANKS & ACCOUNTS',
    tabs: ['BANKS', 'SHOPS', 'PAYPAL'],
    subTabs: ['BRUTE/LOGS', 'SELF REGISTRATIONS'],

    fields: [
      { name: 'bank', label: 'Bank Name', type: 'select', options: ['Please select'] },
      { name: 'country', label: 'Country', type: 'select', options: ['Please select'] },
      { name: 'sellers', label: 'Sellers', type: 'select', options: ['Please select'], accent: true },
      { name: 'balance', label: 'Balance', type: 'fromto' },
      { name: 'points', label: 'Points', type: 'fromto' },
      { name: 'price', label: 'Price', type: 'fromto' },
      { name: 'domain', label: 'Domain', type: 'select', options: ['Please select'] },
      { name: 'address', label: 'Address', type: 'text' },
      { name: 'cc', label: 'Credit Card', type: 'select', options: ['All'] },
      { name: 'bankAcc', label: 'Bank ACC', type: 'select', options: ['All'] },
      { name: 'lastOrd', label: 'Last Ord', type: 'select', options: ['All'] },
    ],
    searchClear: { refresh: true },
    hideFilter: true,
    rightAction: 'BUY SELECTED',
    table: {
      columns: ['Bank Name', 'Balance', 'Points', 'Country', 'Address', 'Credit Card', 'Bank Acc', 'Last Ord', 'Domain', 'Additional Information', 'Uploaded', 'Seller', 'Price'],
      selectAll: true,
    },
  },

  'otp-bot': {
    title: 'OTP BOT',
    fields: [
      { name: 'service', label: 'Service', type: 'select', options: ['Please select'] },
      { name: 'country', label: 'Country', type: 'select', options: ['Please select'] },
      { name: 'note', label: 'Note', type: 'text', placeholder: 'Enter some note' },
    ],
    rightAction: 'BUY NUMBER',
    table: { columns: ['Status', 'Phone', 'Note', 'Messages'] },
  },

  rdp: {
    title: 'RDPS',
    fields: [
      { name: 'country', label: 'Country', type: 'select', options: ['All'] },
      { name: 'state', label: 'State', type: 'select', options: ['All'] },
      { name: 'city', label: 'City', type: 'select', options: ['All'] },
      { name: 'zip', label: 'ZIP', type: 'select', options: ['All'] },
    ],
    searchClear: {},
    table: { columns: ['AddedOn', 'IP', 'Country', 'State', 'City', 'Zip', 'ShortOS', 'Ram', 'DownSpeed', 'UpSpeed', 'AdminRights', 'Status', 'Isp', 'Price'] },
  },
};

// ─── product entry fields per category (admin form + table mapping; price comes from product.price) ───
export const ITEM_FIELDS: Record<string, { key: string; label: string; type?: 'text' | 'number' }[]> = {
  'cvv': [
    { key: 'bin', label: 'BIN' },
    { key: 'expDate', label: 'Exp Date' },
    { key: 'firstName', label: 'First name' },
    { key: 'country', label: 'Country' },
    { key: 'state', label: 'State' },
    { key: 'city', label: 'City' },
    { key: 'zip', label: 'ZIP' },
    { key: 'info', label: 'Info' },
    { key: 'address', label: 'Address' },
    { key: 'binInfo', label: 'BIN Info' },
    { key: 'base', label: 'Base' },
    { key: 'valid', label: 'Valid %' },
    { key: 'refundable', label: 'Refundable' },
  ],
  ssn: [
    { key: 'firstName', label: 'First name' },
    { key: 'lastName', label: 'Last name' },
    { key: 'type', label: 'Type (SSN/DOB/Phone)' },
    { key: 'value', label: 'Value' },
  ],
  checkers: [
    { key: 'ccNum', label: 'CC Num' },
    { key: 'exp', label: 'Exp (MM/YY)' },
    { key: 'cvv2', label: 'CVV2' },
    { key: 'provider', label: 'Provider' },
    { key: 'address', label: 'Address' },
    { key: 'zip', label: 'ZIP' },
    { key: 'avs', label: 'AVS' },
    { key: 'type', label: 'Type' },
    { key: 'status', label: 'Status' },
  ],
  dumps: [
    { key: 'bin', label: 'BIN' },
    { key: 'svc', label: 'SVC' },
    { key: 'mm', label: 'MM' },
    { key: 'yy', label: 'YY' },
    { key: 'country', label: 'Country' },
    { key: 'bank', label: 'Bank' },
    { key: 'level', label: 'Level' },
    { key: 'type', label: 'Type' },
    { key: 'address', label: 'Address' },
    { key: 't1', label: 'T1' },
    { key: 'zip', label: 'ZIP' },
    { key: 'refundable', label: 'Refundable' },
  ],
  'sms-activate': [
    { key: 'status', label: 'Status' },
    { key: 'phone', label: 'Phone' },
    { key: 'note', label: 'Note' },
    { key: 'messages', label: 'Messages' },
  ],
  flooders: [
    { key: 'status', label: 'Status' },
    { key: 'phone', label: 'Phone' },
    { key: 'note', label: 'Note' },
    { key: 'calls', label: 'Calls' },
  ],
  proxies: [
    { key: 'ip', label: 'IP' },
    { key: 'domain', label: 'Domain' },
    { key: 'dns', label: 'DNS' },
    { key: 'type', label: 'Type' },
    { key: 'speed', label: 'Speed' },
    { key: 'ping', label: 'PING' },
    { key: 'country', label: 'Country' },
    { key: 'state', label: 'State' },
    { key: 'city', label: 'City' },
    { key: 'zip', label: 'ZIP' },
  ],
  'banks_and_accounts': [
    { key: 'bankName', label: 'Bank Name' },
    { key: 'balance', label: 'Balance' },
    { key: 'points', label: 'Points' },
    { key: 'country', label: 'Country' },
    { key: 'address', label: 'Address' },
    { key: 'creditCard', label: 'Credit Card' },
    { key: 'bankAcc', label: 'Bank ACC' },
    { key: 'lastOrd', label: 'Last Ord' },
    { key: 'domain', label: 'Domain' },
    { key: 'additional', label: 'Additional Information' },
    { key: 'uploaded', label: 'Uploaded' },
    { key: 'seller', label: 'Seller' },
  ],
  'otp-bot': [
    { key: 'status', label: 'Status' },
    { key: 'phone', label: 'Phone' },
    { key: 'note', label: 'Note' },
    { key: 'messages', label: 'Messages' },
  ],
  rdp: [
    { key: 'addedOn', label: 'AddedOn' },
    { key: 'ip', label: 'IP' },
    { key: 'country', label: 'Country' },
    { key: 'state', label: 'State' },
    { key: 'city', label: 'City' },
    { key: 'zip', label: 'Zip' },
    { key: 'os', label: 'ShortOS' },
    { key: 'ram', label: 'Ram' },
    { key: 'down', label: 'DownSpeed' },
    { key: 'up', label: 'UpSpeed' },
    { key: 'adminRights', label: 'AdminRights' },
    { key: 'status', label: 'Status' },
    { key: 'isp', label: 'Isp' },
  ],
};
