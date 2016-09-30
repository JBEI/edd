/**
 * Created by tlopez on 9/26/16.
 */
describe('import page', function() {

  browser.driver.ignoreSynchronization = true;

  beforeEach(function() {
    browser.driver.get(browser.params.url);
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 300000;
    });


it('should have the right study name for data import', function() {
    browser.driver.get(browser.params.url + 'study/10/import');
    var header = browser.driver.findElement(by.tagName('h1'));
    expect(header.getText()).toEqual('Data import for CJJ-Test');
  });
});
