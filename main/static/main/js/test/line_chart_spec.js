
describe('Test GraphHelperMethods with jasmine ', function() {
 

  var unitTypes = {1:{"id":1,"name":"n/a"},2:{"id":2,"name":"hours"}}
  var single = {"x_units":1,"assay":4934,"y_units":1, "type":3,"id":259317,
        "values":[[[16],[0.2805]],[[13],[0.1305]],[[19],[1.359]],[[12],[0.08]],[[15],[0.271]],
          [[11],[0.0455]],[[18],[0.8965]],[[14],[0.157]],[[17],[0.584]],[[20],[3.186]]]};    

  var dataTest = {UnitTypes: {1:{"id":1,"name":"n/a"},2:{"id":2,"name":"hours"}}};

  var transformedData = { label: 'dt4934', x: 11, y: 0.0455, x_unit: 'n/a', y_unit: 'n/a', name: 'test' };

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
      expect(GraphHelperMethods.transformSingleLineItem(dataTest, single, "test")[0]).toEqual(transformedData);
      })
    it('should sort the x values', function() {
       var transformedData2 = { label: 'dt4934', x: 20, y: 3.186, x_unit: 'n/a', y_unit: 'n/a', name: 'test' };
       var objectLength = GraphHelperMethods.transformSingleLineItem(dataTest, single, "test").length;
      expect(GraphHelperMethods.transformSingleLineItem(dataTest, single, "test")[objectLength - 1]).toEqual(transformedData2);
    })
    it('should return the correct number of objects', function() {
       var objectLength = GraphHelperMethods.transformSingleLineItem(dataTest, single, "test").length;
      expect(objectLength).toEqual(10);
    })
  })

  describe('method: findYUnits' ,function() {
    it('should return the correct y unit name', function() {
      var transformedDataArr = [{ label: 'dt4934', x: 20, y: 3.186, x_unit: 'n/a', y_unit: 'n/a', name: 'test' }];
      expect(GraphHelperMethods.findY_Units(transformedDataArr)).toEqual(["n/a"]);
    });

     it('should return the correct y unit names for data with different measurements', function() {
      var transformedDataArr = [{ label: 'dt4934', x: 20, y: 3.186, x_unit: 'n/a', y_unit: 'n/a', name: 'test' },
      { label: 'dt4934', x: 20, y: 3.186, x_unit: 'n/a', y_unit: 'test', name: 'test' }];
      expect(GraphHelperMethods.findY_Units(transformedDataArr)).toEqual(["n/a", "test"]);
    });
  });

  describe('method: findXUnits' ,function() {
    it('should return the correct y unit name', function() {
      var transformedDataArr = [{ label: 'dt4934', x: 20, y: 3.186, x_unit: 'n/a', y_unit: 'n/a', name: 'test' }];
      expect(GraphHelperMethods.findX_Units(transformedDataArr)).toEqual(["n/a"]);
    });
    it('should return the correct x unit names for data different measurements', function() {
      var transformedDataArr = [{ label: 'dt4934', x: 20, y: 3.186, x_unit: 'n/a', y_unit: 'n/a', name: 'test' },
      { label: 'dt4934', x: 20, y: 3.186, x_unit: 'test', y_unit: 'test', name: 'test' }];
      expect(GraphHelperMethods.findY_Units(transformedDataArr)).toEqual(["n/a", "test"]);
    });
  });

  describe('method: findAssayIds' ,function() {
    it('should return the correct assay ids', function() {
      var assayMeasurements = {"259316":{"assay":4933}, "2849": {"assay": 490}};
      expect(GraphHelperMethods.findAssayIds(assayMeasurements)).toEqual([490, 4933]);
    });
  });
  
  describe('method: findLidIds' ,function() {
    it('should return the correct assay ids', function() {
      var assays = {"490":{"lid":4}, "4933": {"lid": 90}};
      expect(GraphHelperMethods.findLidIds(assays, [490, 4933])).toEqual([4, 90]);
    });
  });

  describe('method: lineName' ,function() {
    it('should return the correct assay ids', function() {
      var assays = {"490":{"name":"test"}, "4933": {"name": "test2"}};
      expect(GraphHelperMethods.lineName(assays, [490, 4933])).toEqual(["test", "test2"]);
    });
  });

  //TODO: test names function, legend, create x axis, create y axis  

  describe('method: displayUnit' ,function() {
    it('should return the correct unit', function() {
      expect(GraphHelperMethods.displayUnit(['test'])).toEqual("test");
    });
    it('should return Mixed Measurements if > 1 name', function() {
      expect(GraphHelperMethods.displayUnit(['unit', 'unit2'])).toEqual("Mixed measurements");
    });
  });


});
