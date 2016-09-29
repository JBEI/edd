describe('study page', function() {

  browser.driver.ignoreSynchronization = true;

  beforeEach(function() {
    browser.driver.get(browser.params.url);
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 300000;
    });
    
  it('should have the right study name', function() {
    browser.driver.get(browser.params.url + 'study/11');
    expect(browser.driver.getTitle()).toEqual('Proteomics - Production Limonene - Experiment Data Depot');
  });

  it('should have the correct contact', function() {
    browser.driver.get(browser.params.url + 'study/10');
    var path = browser.driver.findElement(by.id('id_study-contact_0'));
    expect(path.getAttribute('value')).toEqual('cjjoshua');
  });
});
