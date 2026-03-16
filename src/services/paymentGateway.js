const axios = require('axios');

const PAYSTACK_BASE_URL = process.env.PAYSTACK_BASE_URL;
const FLW_BASE_URL = process.env.FLUTTERWAVE_BASE_URL;
const GLOBALPAY_BASE_URL = process.env.GLOBALPAY_BASE_URL; // bare URL to generate payment link

async function initiatePayment({ gateway, amount, email, metadata, redirectUrl }) {
  // if (gateway === 'paystack') {
  //   // Disabled: Paystack gateway
  //   const secret = process.env.PAYSTACK_SECRET_KEY;
  //   const txRef = `NBUPORTAL_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  //   const res = await axios.post(
  //     `${PAYSTACK_BASE_URL}/transaction/initialize`,
  //     {
  //       amount: Math.round(amount * 100),
  //       email,
  //       metadata,
  //       callback_url: redirectUrl,
  //       currency: 'NGN',
  //       reference: txRef,
  //     },
  //     { headers: { Authorization: `Bearer ${secret}` } }
  //   );
  //   const data = res.data.data;
  //   return {
  //     gateway,
  //     reference: txRef,
  //     authorization_url: data.authorization_url,
  //   };
  // }

  // if (gateway === 'flutterwave') {
  //   // Disabled: Flutterwave gateway
  //   const secret = process.env.FLUTTERWAVE_SECRET_KEY;
  //   const txRef = `NBUPORTAL_${Date.now()}`;
  //   const res = await axios.post(
  //     `${FLW_BASE_URL}/payments`,
  //     {
  //       tx_ref: txRef,
  //       amount,
  //       currency: 'NGN',
  //       redirect_url: redirectUrl,
  //       customer: { email },
  //       meta: metadata,
  //     },
  //     { headers: { Authorization: `Bearer ${secret}` } }
  //   );
  //   const data = res.data.data;
  //   return {
  //     gateway,
  //     reference: txRef,
  //     link: data.link,
  //   };
  // }

  if (gateway === 'global') {
    const pubKey = process.env.GLOBALPAY_PUBLIC_KEY;
    if (!GLOBALPAY_BASE_URL || !pubKey) {
      throw new Error('GlobalPay configuration missing (GLOBALPAY_BASE_URL or GLOBALPAY_PUBLIC_KEY)');
    }
    const txRef = `NBUPORTAL_${Date.now()}`;
    const fullName = (metadata?.studentName ?? '').trim();
    const [firstName, ...rest] = fullName.split(' ');
    const lastName = rest.join(' ');
    const redirectWithParams = `${redirectUrl}${redirectUrl?.includes('?') ? '&' : '?'}gateway=${gateway}&reference=${encodeURIComponent(txRef)}`;
    const payload = {
      amount,
      merchantTransactionReference: txRef,
      redirectURL: redirectWithParams,
      // Some integrations expect Paystack-style key; include for compatibility
      callback_url: redirectWithParams,
      customer: {
        lastName: lastName || firstName || 'Student',
        firstName: firstName || 'NBU',
        currency: 'NGN',
        phoneNumber: metadata?.phoneNumber ?? '',
        address: metadata?.address ?? '',
        emailAddress: email,
      },
    };
    const res = await axios.post(GLOBALPAY_BASE_URL, payload, {
      headers: {
        apikey: pubKey,
        language: 'en',
      },
    });
    const data = res.data?.data;
    const checkoutUrl = data?.checkoutUrl;
    if (!checkoutUrl) {
      throw new Error('GlobalPay did not return checkoutUrl');
    }
    return { gateway, reference: txRef, link: checkoutUrl };
  }

  throw new Error('Unsupported payment gateway');
}

async function verifyPayment({ gateway, reference }) {
  // if (gateway === 'paystack') {
  //   // Disabled: Paystack gateway
  //   const secret = process.env.PAYSTACK_SECRET_KEY;
  //   if (!secret) {
  //     return { gateway, reference, verified: false, error: 'PAYSTACK_SECRET_KEY not configured' };
  //   }
  //   try {
  //     const res = await axios.get(
  //       `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
  //       { headers: { Authorization: `Bearer ${secret}` } }
  //     );
  //     const verified = res.data?.data?.status === 'success';
  //     return { gateway, reference, verified };
  //   } catch (err) {
  //     const message = err?.response?.data?.message || err?.message || 'Paystack verify error';
  //     return { gateway, reference, verified: false, error: message };
  //   }
  // }

  // if (gateway === 'flutterwave') {
  //   // Disabled: Flutterwave gateway
  //   const secret = process.env.FLUTTERWAVE_SECRET_KEY;
  //   if (!secret) {
  //     return { gateway, reference, verified: false, error: 'FLUTTERWAVE_SECRET_KEY not configured' };
  //   }
  //   try {
  //     const res = await axios.get(
  //       `${FLW_BASE_URL}/transactions/verify_by_reference?tx_ref=${reference}`,
  //       { headers: { Authorization: `Bearer ${secret}` } }
  //     );
  //     const verified = res.data?.status === 'success';
  //     return { gateway, reference, verified };
  //   } catch (err) {
  //     const message = err?.response?.data?.message || err?.message || 'Flutterwave verify error';
  //     return { gateway, reference, verified: false, error: message };
  //   }
  // }

  if (gateway === 'global') {
    const pubKey = process.env.GLOBALPAY_PUBLIC_KEY;
    if (!pubKey) {
      return { gateway, reference, verified: false, error: 'GLOBALPAY_PUBLIC_KEY not configured' };
    }
    try {
      // Use documented verify-by-merchant-reference endpoint (preferred)
      // Docs: https://paygw.globalpay.com.ng/globalpay-paymentgateway/api/paymentgateway/query-single-transaction-by-merchant-reference/{MERCHANT_TRANS_REF}
      const override = process.env.GLOBALPAY_QUERY_URL; // optional complete endpoint base
      const root = 'https://paygw.globalpay.com.ng/globalpay-paymentgateway/api/paymentgateway';
      const url = `${override ? override : `${root}/query-single-transaction-by-merchant-reference`}/${encodeURIComponent(reference)}`;
      const res = await axios.get(url, { headers: { apikey: pubKey, language: 'en' } });
      const body = res.data;
      // Handle data as object or array (some endpoints return array)
      const dataItem = Array.isArray(body?.data) ? body.data[0] : body?.data;

      const isSuccessful = body?.isSuccessful === true;
      const code = body?.responseCode;

      // Check both paymentStatus (docs) and transactionStatus (observed)
      const status = dataItem?.paymentStatus || dataItem?.transactionStatus;
      const merchantRef = dataItem?.merchantTransactionReference || dataItem?.merchantTxnref || reference;

      const message = body?.responseMessage || body?.successMessage || body?.responseDescription || body?.message;     
      const statusNorm = String(status || '').toLowerCase();
      const successStates = new Set(['success', 'successful', 'approved', 'completed', 'paid']);
      const verified = successStates.has(statusNorm) || isSuccessful === true || code === '00' || code === '200' || code === 200;
      return { gateway, reference, verified, isSuccessful, responseCode: code, responseMessage: message, paymentStatus: status, merchantRef };
    } catch (err) {
      // Fallback: some integrations require query by provider payRef
      try {
        const override = process.env.GLOBALPAY_QUERY_URL; // optional complete endpoint base
        const root = 'https://paygw.globalpay.com.ng/globalpay-paymentgateway/api/paymentgateway';
        const urlRef = `${override ? override : `${root}/query-single-transaction-by-reference`}/${encodeURIComponent(reference)}`;
        const res2 = await axios.get(urlRef, { headers: { apikey: pubKey, language: 'en' } });
        const body2 = res2.data;
        const dataItem2 = Array.isArray(body2?.data) ? body2.data[0] : body2?.data;

        const isSuccessful2 = body2?.isSuccessful === true;
        const code2 = body2?.responseCode;
        const status2 = dataItem2?.paymentStatus || dataItem2?.transactionStatus;
        const merchantRef2 = dataItem2?.merchantTransactionReference || dataItem2?.merchantTxnref || undefined;        
        const message2 = body2?.responseMessage || body2?.successMessage || body2?.responseDescription || body2?.message;
        const statusNorm2 = String(status2 || '').toLowerCase();
        const successStates2 = new Set(['success', 'successful', 'approved', 'completed', 'paid']);
        const verified2 = successStates2.has(statusNorm2) || isSuccessful2 === true || code2 === '00' || code2 === '200' || code2 === 200;
        return { gateway, reference, verified: verified2, isSuccessful: isSuccessful2, responseCode: code2, responseMessage: message2, paymentStatus: status2, merchantRef: merchantRef2 };
      } catch (err2) {
        const message = err2?.response?.data?.error || err?.response?.data?.error || err2?.message || err?.message || 'GlobalPay verify error';
        return { gateway, reference, verified: false, error: message };
      }
    }
  }

  throw new Error('Unsupported payment gateway');
}

module.exports = { initiatePayment, verifyPayment };
