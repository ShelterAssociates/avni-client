import React, {Component} from 'react';
import {View} from "react-native";
import PropTypes from "prop-types";
import {ErrorDisplay} from "./ErrorDisplay";
import BrandLogos from "../../views/common/BrandLogos";
import {JSONStringify} from "../../utility/JsonStringify";

export default class UnhandledErrorView extends Component {
    static propTypes = {
        avniError: PropTypes.object.isRequired
    };

    render() {
        console.log("UnhandledErrorView", JSONStringify(this.props.avniError));
        return <View style={{flex: 1}}>
            <View style={{paddingVertical: 24}}><BrandLogos/></View>
            <ErrorDisplay avniError={this.props.avniError}/>
        </View>
    }
}
