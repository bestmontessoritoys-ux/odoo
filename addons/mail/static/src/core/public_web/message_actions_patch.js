import { registerMessageAction } from "@mail/core/common/message_actions";
import { _t } from "@web/core/l10n/translation";

registerMessageAction("pin", {
    condition: ({ inputs, ancestors, store }) =>
        !ancestors.inMessagingMenu &&
        !inputs.message().pinned_at &&
        store.self_user &&
        inputs.message().thread &&
        !inputs.message().channel_id?.isReadonlyForSelf,
    icon: "push_pin",
    name: _t("Pin"),
    onSelected: ({ inputs, action }) =>
        (inputs.message().channel_id || inputs.message().thread).messagePin(inputs.message(), {
            rootRef: action.actionRef,
        }),
    sequence: 70,
});

registerMessageAction("unpin", {
    condition: ({ inputs, ancestors, store }) =>
        !ancestors.inMessagingMenu &&
        inputs.message().pinned_at &&
        store.self_user &&
        inputs.message().thread &&
        !inputs.message().channel_id?.isReadonlyForSelf,
    icon: "push_pin",
    name: _t("Unpin"),
    onSelected: ({ inputs, action }) =>
        (inputs.message().channel_id || inputs.message().thread).messageUnpin(inputs.message(), {
            rootRef: action.actionRef,
        }),
    sequence: 70,
});
