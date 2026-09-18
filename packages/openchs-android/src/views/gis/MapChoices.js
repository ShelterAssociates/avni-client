import React from 'react';
import {Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Colors from '../primitives/Colors';
import AvniIcon from '../common/AvniIcon';
import UserInfoService from '../../service/UserInfoService';
import {openMapBrowser, registrationChoices} from '../../gis/mapBrowser';

// "What are you filling?" — the Register page's forms, so the map opens for the right subject type.
export function openMap(source, setOpen) {
    const choices = choicesFor(source);
    if (choices.length === 1) openMapBrowser(source, choices[0]);
    else setOpen(true);
}

function choicesFor(source) {
    const registerEnrol = source.context.getService(UserInfoService).getUserSettings().registerEnrol;
    return registrationChoices(source.context, source.I18n, registerEnrol);
}

export default function MapChoices({source, visible, onClose, anchor = 'center'}) {
    if (!visible) return null;
    const pick = choice => { onClose(); openMapBrowser(source, choice); };
    return (
        <Modal transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={[styles.backdrop, anchor === 'bottom-right' && styles.bottomRight]} activeOpacity={1} onPress={onClose}>
                <View style={styles.sheet}>
                    <Text style={styles.title}>{source.I18n.t('mapWhatAreYouFilling')}</Text>
                    {choicesFor(source).map(choice => (
                        <TouchableOpacity key={choice.key} style={styles.row} onPress={() => pick(choice)}>
                            <View style={[styles.dot, {backgroundColor: choice.program ? choice.program.colour : Colors.AccentColor}]}/>
                            <Text style={styles.label}>{choice.label}</Text>
                            <AvniIcon name="chevron-right" type="MaterialIcons" style={styles.chevron}/>
                        </TouchableOpacity>
                    ))}
                </View>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24},
    bottomRight: {justifyContent: 'flex-end', alignItems: 'flex-end', paddingBottom: 160},
    sheet: {backgroundColor: Colors.cardBackgroundColor, borderRadius: 8, paddingVertical: 8, minWidth: 260, elevation: 8},
    title: {fontSize: 12, color: Colors.SecondaryText, paddingHorizontal: 16, paddingVertical: 8},
    row: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.InputBorderNormal, gap: 12},
    dot: {width: 10, height: 10, borderRadius: 5},
    label: {flex: 1, fontSize: 16, color: Colors.DefaultPrimaryColor},
    chevron: {fontSize: 22, color: Colors.SecondaryText},
});
