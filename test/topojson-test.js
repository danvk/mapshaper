
var api = require('../'),
  assert = require('assert'),
  TopoJSON = api.internal.topojson,
  ArcCollection = api.internal.ArcCollection,
  Utils = api.utils;

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function fixPath(p) {
  return require('path').join(__dirname, p);
}

describe('topojson-export.js and topojson-import.js', function () {

  describe('calcExportBounds()', function () {
    it('default uses 0.02 of avg. segment', function () {
      var arcs = new api.internal.ArcCollection([[[0, 0], [2, 1]], [[0, 1], [2, 0]]]);
      var bounds = new api.internal.Bounds(0, 0, 2, 1);
      var bounds2 = TopoJSON.calcExportBounds(bounds, arcs, {});
      assert.deepEqual(bounds2.toArray(), [0, 0, 50, 50]);
    })

    it('user-defined precision', function () {
      var arcs = new api.internal.ArcCollection([[[0, 0], [2, 1]]]);
      var bounds = new api.internal.Bounds(0, 0, 2, 1);
      var bounds2 = TopoJSON.calcExportBounds(bounds, arcs, {topojson_precision: 0.1});
      assert.deepEqual(bounds2.toArray(), [0, 0, 10, 10]);
    })

    it('quantization option', function () {
      var arcs = new api.internal.ArcCollection([[[0, 0], [2, 1]]]);
      var bounds = new api.internal.Bounds(0, 0, 2, 1);
      var bounds2 = TopoJSON.calcExportBounds(bounds, arcs, {quantization: 1000});
      assert.deepEqual(bounds2.toArray(), [0, 0, 999, 999]);
    })

    it('precision option', function () {
      var arcs = new api.internal.ArcCollection([[[0, 0], [2, 1]]]);
      var bounds = new api.internal.Bounds(0, 0, 2, 1);
      var bounds2 = TopoJSON.calcExportBounds(bounds, arcs, {precision: 0.1});
      assert.deepEqual(bounds2.toArray(), [0, 0, 20, 10]);
    })
  })

  it('preserve top-level crs', function(done) {
    var crs = {
      "type": "name",
      "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}
    };
    var input = {
      crs: crs,
      type: 'Topology',
      objects: {
        point: {
          type: 'Point',
          coordinates: [0, 0]
        }
      }
    };
    api.applyCommands('', input, function(err, data) {
      var output = JSON.parse(data);
      assert.deepEqual(output.crs, crs);
      done();
    })
  });


  describe('exportProperties', function () {
    it('use id_field option', function () {
      var geometries = [{type: null}, {type: null}],
          records = [{idx: 0}, {idx: 1}],
          table = new api.internal.DataTable(records);

      TopoJSON.exportProperties(geometries, table, {id_field:'idx'});
      assert.deepEqual(geometries, [{
        type: null,
        properties: {idx: 0},
        id: 0
      }, {
        type: null,
        properties: {idx: 1},
        id: 1
      }])
    });

    it('default id field gets moved from table to id property', function () {
      var geometries = [{type: null}, {type: null}],
          records = [{FID: 0}, {FID: 1}],
          table = new api.internal.DataTable(records);

      TopoJSON.exportProperties(geometries, table, {});
      assert.deepEqual(geometries, [{
        type: null,
        id: 0
      }, {
        type: null,
        id: 1
      }])
    });


    // first matching name in the table is used for id property
    it('use id_field with list of fields', function () {
      var geometries = [{type: null}, {type: null}],
          records = [{ID: 0, NAME: 'a'}, {ID: 1, NAME: 'b'}],
          table = new api.internal.DataTable(records);

      TopoJSON.exportProperties(geometries, table, {id_field:['COUNTY', 'ID', 'NAME']});
      assert.deepEqual(geometries, [{
        type: null,
        properties: {ID: 0, NAME: 'a'},
        id: 0
      }, {
        type: null,
        properties: {ID: 1, NAME: 'b'},
        id: 1
      }])
    });


    it('use cut_table option', function () {
      var geometries = [{type: null}, {type: null}],
          records = [{FID: 0}, {FID: 1}],
          table = new api.internal.DataTable(records);

      TopoJSON.exportProperties(geometries, table, {id_field:'FID', cut_table: true});
      assert.deepEqual(geometries, [{
        type: null,
        id: 0
      }, {
        type: null,
        id: 1
      }])
    });
  });

  describe('filterEmptyArcs()', function () {
    //      b     d
    //     / \   / \
    //    /   \ /   \
    //   a --- c --- e

    // cc, ddd, cabc, cdec
    var arcs = [[[3, 1], [3, 1]], [[4, 3], [4, 3], [4, 3]], [[3, 1], [1, 1], [2, 3], [3, 1]],
        [[3, 1], [4, 3], [5, 1], [3, 1]]];
    var coords = new ArcCollection(arcs);

    it('Collapsed arcs are removed', function () {
      var shape = [[0, ~1, 3]],
          filtered = api.internal.filterEmptyArcs(shape, coords);
      assert.deepEqual(filtered, [[3]]);
    })
    it('Collapsed paths are removed', function () {
      var shape = [[~0, 1]],
          filtered = api.internal.filterEmptyArcs(shape, coords);
      assert.deepEqual(filtered, null);
    })
  })

  describe('Import/export tests', function() {
    it('id property is retained', function() {
      var topology = {
        type: "Topology",
        arcs: [],
        objects: {
          points: {
            type: "GeometryCollection",
            geometries: [{
              type: "Point",
              coordinates: [0, 0],
              id: 0,
              properties: {foo: 'A'}
            }]
          }
        }
      };
      var out = importExport(topology, {});
    })

    it("topology contains only points", function() {
      var topology = {
        type: "Topology",
        arcs: [],
        objects: {
          points: {
            type: "GeometryCollection",
            geometries: [
              {type: "Point", coordinates: [1, 2]},
              {type: "MultiPoint", coordinates: [[2, 3], [3, 4]]},
              {type: null}
            ]
          }
        }
      };
      var out = importExport(topology, {topojson_resolution: 0});
      assert.deepEqual(out, topology);
    })

  })

  describe('TopoJSON import', function () {
    it('GeometryCollection with all null geometries is imported without shapes', function() {
      var obj = {
        type: 'GeometryCollection',
        geometries: [{
          type: null,
          properties: {foo: 'a'}
        }]
      }
      var lyr = TopoJSON.importObject(obj);
      assert.equal(lyr.geometry_type, undefined);
      assert.equal(lyr.shapes, undefined);
      assert.deepEqual(lyr.data.getRecords(), [{foo: 'a'}]);
    })

    it('importObject() with id_field', function () {
      var obj = {
        type: "Point",
        id: 'bar',
        coordinates: [3, 2]
      };
      var lyr = TopoJSON.importObject(obj, {id_field: 'foo'});
      var records = lyr.data.getRecords();
      assert.deepEqual(records, [{foo: 'bar'}]);
    })
  })

  describe('TopoJSON export', function () {

    it("dataset with no geometry", function() {
      var dataset = {
        layers: [{
          name: 'a',
          data: new api.internal.DataTable([{foo:'a'}, {foo:'b'}])
        }]
      };
      var output = TopoJSON.exportTopology(dataset, {});
      assert.deepEqual(output.objects, {a:{
        type: "GeometryCollection",
        geometries: [{type: null, properties: {foo:'a'}},
            {type: null, properties: {foo: 'b'}}]
      }});
    })

    it("polygon with hole and null shape", function () {
      //       e
      //      / \
      //     /   \
      //    /  a  \
      //   /  / \  \
      //  h  d   b  f
      //   \  \ /  /
      //    \  c  /
      //     \   /
      //      \ /
      //       g
      //
      //   abcda, efghe
      //   0/-1,  1

      var arcs = [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
          [[3, 5], [5, 3], [3, 1], [1, 3], [3, 5]]];
      var data = {
        arcs: new ArcCollection(arcs),
        layers: [{
          name: "polygons",
          geometry_type: "polygon",
          shapes: [null, [[0]], [[1], [~0]]]
        }]
      };

      var target = {
        type: "Topology",
        arcs: [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
          [[3, 5], [5, 3], [3, 1], [1, 3],[3, 5]]],
        objects: {
          polygons: {
            type: "GeometryCollection",
            geometries: [{
              type: null
            }, {
              type: "Polygon",
              arcs: [[0]]
            }, {
              type: "Polygon",
              arcs: [[1], [~0]]
            }]
          }
        }
      };

      var result = TopoJSON.exportTopology(data, {no_quantization: true});
      assert.deepEqual(result, target);
    })

    it("multipolygon", function () {
      //       e
      //      / \
      //     /   \
      //    /  a  \
      //   /  / \  \
      //  h  d   b  f
      //   \  \ /  /
      //    \  c  /
      //     \   /
      //      \ /
      //       g
      //
      //   abcda, efghe
      //   0/-1,  1

      var arcs = [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
          [[3, 5], [5, 3], [3, 1], [1, 3], [3, 5]]];
      var data = {
        arcs: new ArcCollection(arcs),
        layers: [{
          name: "polygons",
          geometry_type: "polygon",
          shapes: [[[0], [1], [~0]]]
        }]
      };

      var target = {
        type: "Topology",
        arcs: [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
          [[3, 5], [5, 3], [3, 1], [1, 3],[3, 5]]],
        objects: {
          polygons: {
            type: "GeometryCollection",
            geometries: [{
              type: "MultiPolygon",
              arcs: [[[0]], [[1], [~0]]]
            }]
          }
        }
      };

      var result = TopoJSON.exportTopology(data, {no_quantization: true});
      assert.deepEqual(result, target);
    })
  })

  describe('Export/Import roundtrip tests', function () {
    it ('preserve feature ids', function(done) {
      var src = {
        type: 'Topology',
        arcs: [],
        objects: {
          a: {type: 'GeometryCollection', geometries: [
            {type: null, id: 0}, {type: null, id: 1}
          ]}
        }
      };
      api.applyCommands('', JSON.stringify(src), function(err, data) {
        assert.deepEqual(src, JSON.parse(data));
        done();
      });
    });

    it('two states', function () {
      topoJSONRoundTrip('test_data/two_states.json');
    })

    it('six counties, two null geometries', function () {
      topoJSONRoundTrip('test_data/six_counties_three_null.json');
    })

    it('internal state borders (polyline)', function () {
      topoJSONRoundTrip('test_data/ne/ne_110m_admin_1_states_provinces_lines.json');
    })
  })
})

function topoJSONRoundTrip(fname) {
  var opts = {
    format:'topojson',
    quantization: 10000
  };
  var data = api.importFile(fixPath(fname));
  var files = api.internal.exportFileContent(data, opts);
  var data2 = api.internal.importFileContent(files[0].content, 'json');
  var files2 = api.internal.exportFileContent(data2, opts);
  assert.equal(files[0].content, files2[0].content);
}

function importExport(json, opts) {
  if (Utils.isObject(json)) {
    // prevent import from modifying TopoJSON coords
    // (need to stop modifying coords in-place);
    json = JSON.stringify(json);
  }
  var data = api.internal.importTopoJSON(json, opts);
  return TopoJSON.exportTopology(data, opts);
}
