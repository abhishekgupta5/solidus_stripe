// Shared code between Payment Intents and Payment Request Button on cart page

(function() {
  var PaymentRequestButtonShared;

  PaymentRequestButtonShared = {
    authToken: $('meta[name="csrf-token"]').attr('content'),

    setUpPaymentRequest: function(opts) {
      var opts = opts || {};
      var config = this.config.payment_request;

      if (config) {
        config.requestShipping = opts.requestShipping || false;

        var paymentRequest = this.stripe.paymentRequest({
          country: config.country,
          currency: config.currency,
          total: {
            label: config.label,
            amount: config.amount
          },
          requestPayerName: false,
          requestPayerEmail: false,
          requestPayerPhone: false,
          requestShipping: config.requestShipping,
          shippingOptions: []
        });

        var prButton = this.elements.create('paymentRequestButton', {
          paymentRequest: paymentRequest
        });

        var onButtonMount = function(result) {
          var id = 'payment-request-button';
          console.log(result);
          if (result && result.applePay) {
            prButton.mount('#' + id);
          } else {
            document.getElementById(id).style.display = 'none';
            var button = document.getElementById("apple-pay-later-button");
            var radio = button.querySelector('.payment-select');
            var card = button.querySelector('.payment-method-card');
            var badge = card.querySelector('.badge-light');
            var alert = document.getElementById("apple-pay-alert");
            card.classList.add('coming-soon');
            radio.disabled = true
            badge.classList.remove('badge-light');
            badge.classList.add('badge-warning');
            badge.innerHTML = "Must use eligible Apple device"
            alert.classList.remove('alert-info');
            alert.classList.add('alert-warning');
            alert.innerHTML = "To use Apple Pay Later, you must be using an <strong>eligible Apple device</strong>. Please select a different payment plan."
          }
          if (typeof this.onPrButtonMounted === 'function') {
            this.onPrButtonMounted(id, result && result.applePay);
          }
        }
        paymentRequest.canMakePayment().then(onButtonMount.bind(this));

        var onPrPaymentMethod = function(result) {
          this.errorElement.text('').hide();
          this.onPrPayment(result);
        };
        paymentRequest.on('paymentmethod', onPrPaymentMethod.bind(this));

        var onShippingAddressChange = function(ev) {
          var showError = this.showError.bind(this);

          fetch('/stripe/shipping_rates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              authenticity_token: this.authToken,
              shipping_address: ev.shippingAddress
            })
          }).then(function(response) {
            return response.json();
          }).then(function(result) {
            if (result.error) {
              showError(result.error);
              return false;
            } else {
              ev.updateWith({
                status: 'success',
                shippingOptions: result.shipping_rates
              });
            }
          });
        };
        paymentRequest.on('shippingaddresschange', onShippingAddressChange.bind(this));
      }
    },

    handleServerResponse: function(response, payment) {
      if (response.error) {
        this.showError(response.error);
        this.completePaymentRequest(payment, 'fail');
      } else if (response.requires_action) {
        var clientSecret = response.stripe_payment_intent_client_secret;
        var onConfirmCardPayment = this.onConfirmCardPayment.bind(this);

        this.stripe.confirmCardPayment(
          clientSecret,
          {payment_method: payment.paymentMethod.id},
          {handleActions: false}
        ).then(function(confirmResult) {
          onConfirmCardPayment(confirmResult, payment, clientSecret)
        });
      } else {
        this.completePayment(payment, response.stripe_payment_intent_id)
      }
    },

    onConfirmCardPayment: function(confirmResult, payment, clientSecret) {
      onStripeResponse = function(response, payment) {
        if (response.error) {
          this.showError(response.error);
        } else {
          this.completePayment(payment, response.paymentIntent.id)
        }
      }.bind(this);

      if (confirmResult.error) {
        this.completePaymentRequest(payment, 'fail');
        this.showError(confirmResult.error);
      } else {
        this.completePaymentRequest(payment, 'success');
        this.stripe.confirmCardPayment(clientSecret).then(function(response) {
          onStripeResponse(response, payment);
        });
      }
    },

    completePayment: function(payment, stripePaymentIntentId) {
      var onCreateBackendPayment = function (response) {
        if (response.error) {
          this.completePaymentRequest(payment, 'fail');
          this.showError(response.error);
        } else {
          this.completePaymentRequest(payment, 'success');
          this.submitPayment(payment);
        }
      }.bind(this);

      fetch('/stripe/create_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_data: this.form ? this.form.serialize() : payment.shippingAddress,
          spree_payment_method_id: this.config.id,
          stripe_payment_intent_id: stripePaymentIntentId,
          authenticity_token: this.authToken
        })
      }).then(function(solidusPaymentResponse) {
        return solidusPaymentResponse.json();
      }).then(onCreateBackendPayment)
    },

    completePaymentRequest: function(payment, state) {
      if (payment && typeof payment.complete === 'function') {
        payment.complete(state);
        if (state === 'fail') {
          // restart the button (required in order to force address choice)
          new SolidusStripe.CartPageCheckout().init();
        }
      }
    }
  };

  Object.assign(SolidusStripe.PaymentIntents.prototype, PaymentRequestButtonShared);
  Object.assign(SolidusStripe.CartPageCheckout.prototype, PaymentRequestButtonShared);
})()
