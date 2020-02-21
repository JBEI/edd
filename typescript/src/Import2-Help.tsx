"use strict";
import * as EddRest from "../modules/EDDRest";
import * as React from "react";
import * as ReactDOM from "react-dom";

export interface SimpleTableProps {
    title: string;
    fieldName: string;
}

export interface SimpleTableState<T> {
    hide: boolean;
    values: T[];
}

// TODO: simple stopgap...replace with much more full-featured BootstrapTable from
// react-bootstrap-table-next after react-stepzilla's react version dependency gets (imminently)
// updated. See https://github.com/newbreedofgeek/react-stepzilla/issues/105.
// Alternatively, replace react-stepzilla if this upgrade takes too much longer.
class DiscloseableTable<T> extends React.Component<
    SimpleTableProps,
    SimpleTableState<T>
> {
    constructor(props) {
        super(props);
        this.state = {
            "hide": true,
            "values": [],
        };
    }

    toggleDisclosed(evt) {
        evt.preventDefault();
        this.setState({
            "hide": !this.state.hide,
        });
    }

    render() {
        const discloseClass = this.state.hide ? "disclose discloseHide" : "disclose";
        return (
            <div className={discloseClass}>
                <span>
                    <a
                        href="#"
                        className="discloseLink"
                        onClick={this.toggleDisclosed.bind(this)}
                    >
                        {this.props.title}
                    </a>
                </span>
                <div className="discloseBody">
                    <table>
                        {this.state.values.map((value) => {
                            return (
                                <tr>
                                    <td>{value[this.props.fieldName]}</td>
                                </tr>
                            );
                        })}
                    </table>
                </div>
            </div>
        );
    }
}

class MtypesTable extends DiscloseableTable<EddRest.MeasurementType> {
    componentDidMount() {
        EddRest.loadMeasurementTypes({
            "type_group": "_",
            "ordering": "type_name",
            "request_all": true,
            "success": this.mtypesLoadSuccess.bind(this),
        });
    }

    mtypesLoadSuccess(mtypes: EddRest.MeasurementType[]) {
        this.setState({ "values": mtypes });
    }
}

class UnitsTable extends DiscloseableTable<EddRest.MeasurementUnits> {
    componentDidMount() {
        EddRest.loadMeasurementUnits({
            "ordering": "unit_name",
            "request_all": true,
            "success": this.unitsLoadSuccess.bind(this),
        });
    }

    unitsLoadSuccess(mtypes: EddRest.MeasurementUnits[]) {
        this.setState({ "values": mtypes });
    }
}

class ProtocolsTable extends DiscloseableTable<EddRest.Protocol> {
    componentDidMount() {
        EddRest.loadProtocols({
            "ordering": "name",
            "request_all": true,
            "success": this.protocolsLoadSuccess.bind(this),
        });
    }

    protocolsLoadSuccess(protocols: EddRest.Protocol[]) {
        this.setState({ "values": protocols });
    }
}

ReactDOM.render(
    <MtypesTable title="Available types" fieldName="type_name" />,
    document.getElementById("genericMtypesTable"),
);
ReactDOM.render(
    <UnitsTable title="Available units" fieldName="unit_name" />,
    document.getElementById("unitsTable"),
);
ReactDOM.render(
    <ProtocolsTable title="Available protocols" fieldName="name" />,
    document.getElementById("protocolsTable"),
);
