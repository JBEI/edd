/**
 * Created by tlopez on 9/26/16.
 */
'use strict';

describe('login', function() {

  browser.driver.ignoreSynchronization = true;

  beforeEach(function() {
    browser.driver.get(browser.params.url);
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 300000;
    });

  it('should log in', function() {

    browser.driver.findElement(by.id('id_login')).sendKeys(browser.params.username);
    browser.driver.findElement(by.id('id_password')).sendKeys(browser.params.password);
    browser.driver.findElement(by.id('id_click')).click();

    var loginElement = browser.driver.findElement(by.className('user_welcome'));
    expect(loginElement.getText()).toEqual('');
  });


});
