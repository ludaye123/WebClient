angular.module('proton.squire')
    .directive('plainTextSelectToggle', (squireDropdown, $rootScope, toggleModeEditor, gettextCatalog, onCurrentMessage) => {

        toggleModeEditor.init();

        const ACTION = 'setEditorMode';
        const MAP_TEXT = {
            'text/plain': gettextCatalog.getString('Plain Text', null, 'Composer Mode'),
            'text/html': gettextCatalog.getString('Normal', null, 'Composer Mode')
        };

        return {
            replace: true,
            templateUrl: 'templates/squire/plainTextSelectToggle.tpl.html',
            link(scope, el) {

                const unsubscribe = [];
                const button = el[0].querySelector('.squireToolbar-action-modeEditor');
                const container = squireDropdown(scope.message);
                const dropdown = container.create(el[0], ACTION);
                const defaultMode = toggleModeEditor.getMode(scope.message);

                container.attach(ACTION, {
                    node: el[0],
                    attribute: 'data-editor-mode'
                });

                dropdown.refresh(MAP_TEXT[defaultMode], defaultMode);

                const toggle = (node) => node.dataset.value || toggleModeEditor.getMode(scope.message);
                const onClick = ({ target }) => {
                    const callback = (target.nodeName === 'LI') ? toggle : _.noop;
                    dropdown.toggle(() => callback(target));
                };

                el.on('click', onClick);

                unsubscribe.push(() => el.off('click', onClick));
                unsubscribe.push(() => dropdown.unsubscribe());
                unsubscribe.push(() => toggleModeEditor.clear(scope.message));
                unsubscribe.push(onCurrentMessage('squire.toggleMode', scope, (type) => {
                    if (type === 'enableToggle' || type === 'disableToggle') {
                        button.disabled = type === 'disableToggle';
                    }
                }));

                scope.$on('$destroy', () => {
                    unsubscribe.forEach((cb) => cb());
                    unsubscribe.length = 0;
                });
            }
        };
    });
