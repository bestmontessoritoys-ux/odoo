import { ActionList } from "./action_list";
import { useMessageActions } from "./message_actions";

import { propStatic, usePropsPlus } from "@mail/utils/common/hooks";
import { useAncestors } from "@mail/core/common/ancestor_plugin";

import { Component, computed, t } from "@odoo/owl";

import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownState } from "@web/core/dropdown/dropdown_hooks";
import { useService } from "@web/core/utils/hooks";

export class MessageContextMenu extends Component {
    static template = "mail.MessageContextMenu";
    static components = { ActionList, Dropdown };

    setup() {
        super.setup();
        this.ancestors = useAncestors();
        this.store = useService("mail.store");
        this.props = usePropsPlus({
            /** Anchor element, owned by the parent and bound here with `t-ref`. */
            anchorRef: propStatic(t.signal(t.instanceOf(HTMLElement))),
            dropdownState: t.instanceOf(DropdownState),
            actionInputs: t.object().optional(),
            message: t.instanceOf(this.store["mail.message"]),
            thread: t.instanceOf(this.store["mail.thread"]).optional(),
        });
        this.messageActions = useMessageActions({
            ...this.props.actionInputs,
            message: computed(() => this.props.message),
            reactionAnchorRef: this.props.anchorRef,
            thread: computed(() => this.props.thread),
            menu: { close: () => this.props.dropdownState.close() },
        });
    }
}
