
describe('Test GraphHelperMethods with jasmine ', function() {
 

  var unitTypes = {1:{"id":1,"name":"n/a"},2:{"id":2,"name":"hours"}}
  var single = {"x_units":1,"assay":4934,"y_units":1, "type":3,"id":259317,
        "values":[[[16],[0.2805]],[[13],[0.1305]],[[19],[1.359]],[[12],[0.08]],[[15],[0.271]],
          [[11],[0.0455]],[[18],[0.8965]],[[14],[0.157]],[[17],[0.584]],[[20],[3.186]]]};    

  var dataTest = {UnitTypes: {1:{"id":1,"name":"n/a"},2:{"id":2,"name":"hours"}}};

  describe('method: objectSize' ,function() {
    it('should return length', function() {
      var object = {"traci": 2, "jbei": 1}
      expect(GraphHelperMethods.objectSize(object)).toEqual(2);
    });

  });
  
  describe('method: sortBarData' ,function() {
    it('should transform arrays into objects', function() {
      var assays = [[{"x": 1, "y": 2, "x_unit": "n/a"}, {"x": 1, "y": 2, "x_unit": "n/a"}],
        [{"x": 1, "y": 2, "x_unit": "n/a"}, {"x": 1, "y": 2, "x_unit": "n/a"}]]

      var assayObject = [{"x": 1, "y": 2, "x_unit": "n/a"}, {"x": 1, "y": 2, "x_unit": "n/a"},
      {"x": 1, "y": 2, "x_unit": "n/a"}, {"x": 1, "y": 2, "x_unit": "n/a"}]
    expect(GraphHelperMethods.sortBarData(assays)).toEqual(assayObject);
    });

  });

  describe('method: unitName' ,function() {
    it('should return the correct unit name based on the id', function() {
      var id = 1;
      expect(GraphHelperMethods.unitName(id, unitTypes)).toEqual("n/a");
    });

    it("should also return the second unit name based on the id", function() {
      expect(GraphHelperMethods.unitName(2, unitTypes)).toEqual("hours");
    })
  });

  //TODO: test svg element

  describe('method: transformSingleLineItem', function() {
    it('should return the correct formatted schema', function() {
      var transformedDataTest = { label: 'dt4934', x: 11, y: 0.0455, x_unit: 'n/a', y_unit: 'n/a', name: 'test' };
      expect(GraphHelperMethods.transformSingleLineItem(dataTest, single, "test")[0]).toEqual(transformedDataTest);
      })
    it('should sort the x values', function() {
       var transformedDataTest = { label: 'dt4934', x: 20, y: 3.186, x_unit: 'n/a', y_unit: 'n/a', name: 'test' };
       var objectLength = GraphHelperMethods.transformSingleLineItem(dataTest, single, "test").length;
      expect(GraphHelperMethods.transformSingleLineItem(dataTest, single, "test")[objectLength - 1]).toEqual(transformedDataTest);
    })
    it('should return the correct number of objects', function() {
       var objectLength = GraphHelperMethods.transformSingleLineItem(dataTest, single, "test").length;
      expect(objectLength).toEqual(10);
    })
  })
  
});
