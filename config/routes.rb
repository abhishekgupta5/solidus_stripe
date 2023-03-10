# frozen_string_literal: true

SolidusStripe::Engine.routes.draw do
  scope ':payment_method_id' do
    get :after_confirmation, controller: :intents
  end
  resources :webhooks, only: :create, format: false
end
