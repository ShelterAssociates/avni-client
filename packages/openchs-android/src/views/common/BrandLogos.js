import React from 'react';
import {Image, Text, View} from 'react-native';
import Colors from '../primitives/Colors';

// Avni × Shelter Associates, for white screens (start-up, login, server URL).
export default function BrandLogos({height = 44}) {
    const logo = {height, width: height * 3.4};
    return (
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10}}>
            <Image source={{uri: 'asset:/logo.png'}} style={logo} resizeMode="contain"/>
            <Text style={{fontSize: height * 0.45, color: Colors.SecondaryText}}>×</Text>
            <Image source={{uri: 'asset:/shelter-logo-dark.png'}} style={logo} resizeMode="contain"/>
        </View>
    );
}
