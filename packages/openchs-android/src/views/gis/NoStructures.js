import React from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Colors from '../primitives/Colors';
import AvniIcon from '../common/AvniIcon';

// Stands in for the map when the latest sync brought no structures for this slum: the only way to
// record a household here is the extra-household flow, so that button is the screen.
export default function NoStructures({message, recent, onRegister, onOpenHousehold}) {
    return (
        <View style={styles.container}>
            <Text style={styles.message}>{message}</Text>
            <TouchableOpacity style={styles.button} onPress={onRegister}>
                <AvniIcon name="home-plus-outline" type="MaterialCommunityIcons" style={styles.buttonIcon}/>
                <Text style={styles.buttonText}>Register extra household</Text>
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>Recent registrations</Text>
            {recent.length === 0
                ? <Text style={styles.empty}>No household registered in this slum yet.</Text>
                : (
                    <ScrollView style={styles.list}>
                        {recent.map(row => (
                            <TouchableOpacity key={row.uuid} style={styles.row} onPress={() => onOpenHousehold(row.uuid)}>
                                <View style={styles.rowText}>
                                    <Text style={styles.rowTitle} numberOfLines={1}>#{row.number}{row.name ? ` — ${row.name}` : ''}</Text>
                                    {row.registeredOn ? <Text style={styles.rowMeta}>Registered {row.registeredOn}</Text> : null}
                                </View>
                                <AvniIcon name="chevron-right" type="MaterialIcons" style={styles.chevron}/>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {flex: 1, paddingHorizontal: 16, paddingTop: 16, backgroundColor: Colors.cardBackgroundColor},
    message: {fontSize: 14, color: Colors.DetailsTextColor, marginBottom: 16},
    button: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.ActionButtonColor, paddingVertical: 18, borderRadius: 6, elevation: 2},
    buttonIcon: {fontSize: 26, color: Colors.TextOnPrimaryColor},
    buttonText: {fontSize: 17, fontWeight: '500', color: Colors.TextOnPrimaryColor},
    sectionTitle: {fontSize: 12, color: Colors.SecondaryText, marginTop: 24, marginBottom: 4},
    empty: {fontSize: 14, color: Colors.SecondaryText, paddingVertical: 12},
    list: {flex: 1},
    row: {flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.InputBorderNormal},
    rowText: {flex: 1},
    rowTitle: {fontSize: 15, color: Colors.DefaultPrimaryColor},
    rowMeta: {fontSize: 12, color: Colors.SecondaryText, marginTop: 2},
    chevron: {fontSize: 22, color: Colors.SecondaryText},
});
