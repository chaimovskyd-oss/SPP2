APP_STYLESHEET = '''
QMainWindow, QWidget {
    background: #17161C;
    color: #F4F0FF;
    font-family: Segoe UI, Arial, sans-serif;
    font-size: 13px;
}
QFrame#TopBar, QFrame#BottomBar {
    background: #1D1B26;
    border-bottom: 1px solid #2A2638;
}
QFrame#BottomBar {
    border-top: 1px solid #2A2638;
    border-bottom: none;
}
QFrame#SidePanel {
    background: #181720;
    border: 1px solid #302A46;
    border-radius: 14px;
}
QFrame#SectionCard {
    background: #211F2C;
    border: 1px solid #3A315A;
    border-radius: 12px;
}
QLabel#PanelTitle {
    font-size: 15px;
    font-weight: 700;
    color: #FFFFFF;
}
QLabel#PanelSubtle {
    color: #B9B1D8;
    font-size: 12px;
}
QLabel#MetricValue {
    color: #FFFFFF;
    font-weight: 600;
}
QPushButton {
    background: #262239;
    color: #F4F0FF;
    border: 1px solid #443A65;
    border-radius: 10px;
    padding: 8px 12px;
    min-height: 20px;
}
QPushButton:hover {
    background: #312A4A;
}
QToolButton {
    background: #262239;
    color: #F4F0FF;
    border: 1px solid #443A65;
    border-radius: 10px;
    padding: 8px 12px;
    min-height: 20px;
}
QToolButton:hover {
    background: #312A4A;
}
QPushButton#PrimaryButton {
    background: #8B74F6;
    border: 1px solid #8B74F6;
    color: white;
    font-weight: 700;
}
QPushButton#PrimaryButton:hover {
    background: #765BEF;
}
QPushButton#SuccessButton {
    background: #20C997;
    border: 1px solid #20C997;
    color: white;
    font-weight: 700;
}
QPushButton#WarnButton {
    background: #F7C948;
    border: 1px solid #F7C948;
    color: #1A1328;
    font-weight: 700;
}
QComboBox, QDoubleSpinBox, QSpinBox {
    background: #262A32;
    color: #FFFFFF;
    border: 1px solid #443A65;
    border-radius: 9px;
    padding: 6px 10px;
    min-height: 22px;
}
QCheckBox {
    spacing: 8px;
}
QCheckBox::indicator {
    width: 16px;
    height: 16px;
}
QScrollArea {
    border: none;
    background: transparent;
}
QFrame#Separator {
    color: #443A65;
    background: #443A65;
    max-height: 1px;
    margin: 4px 0;
}
QLabel#CanvasTitle {
    color: #FFFFFF;
    font-size: 20px;
    font-weight: 700;
}
QLabel#CanvasSubtle {
    color: #B9B1D8;
    font-size: 12px;
}
QLabel#WarningBanner {
    background: #3B2D18;
    color: #FFF1C2;
    border: 1px solid #C0902E;
    border-radius: 10px;
    padding: 8px 10px;
}
QTabWidget::pane {
    border: 1px solid #302A46;
    background: #181720;
    border-top: none;
}
QTabWidget {
    background: #181720;
}
QTabBar {
    background: #181720;
}
QTabBar::tab {
    background: #211F2C;
    color: #9A91B8;
    border: 1px solid #302A46;
    border-bottom: none;
    border-radius: 8px 8px 0 0;
    padding: 7px 16px;
    min-width: 58px;
    font-size: 12px;
}
QTabBar::tab:selected {
    background: #181720;
    color: #FFFFFF;
    font-weight: 700;
    border-color: #8B74F6;
}
QTabBar::tab:hover:!selected {
    background: #262239;
    color: #DAD4F7;
}
QLabel#TabWarning {
    color: #F7C948;
    font-size: 12px;
    font-weight: 600;
}
'''
