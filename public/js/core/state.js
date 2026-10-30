// Shared application state (one object imported by every module)
export const S = {
  token: localStorage.getItem('sw_token'), user: null, shop: 'ShopWatch', cur: 'UGX',
  codeReq: false, defTz: 3, page: null,
  products: [], cart: {}, prices: {}, pay: null,
  from: null, to: null, efrom: null, eto: null, rfrom: null, rto: null, pfrom: null, pto: null,
  report: null, shopList: '', sales: [], receipt: null, caps: [], roleLabel: '',
};
export const isOwner = () => S.user?.role === 'owner';
// does the signed-in employee's role allow this? (the server checks again on every request)
export const can = cap => S.user?.role === 'owner' || S.caps.includes(cap);
