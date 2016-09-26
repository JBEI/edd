/**
 * Created by tlopez on 9/26/16.
 */
'use strict';

describe('login', function() {

  browser.driver.ignoreSynchronization = true;

  beforeEach(function() {
    browser.driver.get('https://192.168.99.100/');
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 300000;
    });

  it('should log in', function() {

    browser.driver.findElement(by.id('id_login')).sendKeys('unprivileged_user');
    browser.driver.findElement(by.id('id_password')).sendKeys('insecure_pwd_ok_for_local_testing');
    browser.driver.findElement(by.id('id_click')).click();

    var loginElement = browser.driver.findElement(by.className('user_welcome'));
    expect(loginElement.getText()).toEqual('');
  });


});
