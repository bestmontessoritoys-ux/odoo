import { registerMessageAction } from "@mail/core/common/message_actions";

import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";

registerMessageAction("set-new-message-separator", {
    condition: ({ inputs }) =>
        inputs.channel()?.self_member_id &&
        inputs.channel().eq(inputs.message().channel_id) &&
        !inputs.message().hasNewMessageSeparator &&
        inputs.message().persistent &&
        !inputs.message().isEmpty,
    icon: "visibility_off",
    name: _t("Mark as Unread"),
    onSelected: ({ inputs }) => {
        const message = inputs.message();
        const selfMember = message.channel_id?.self_member_id;
        if (selfMember) {
            selfMember.new_message_separator = message.id;
            selfMember.new_message_separator_ui = selfMember.new_message_separator;
        }
        message.channel_id.markedAsUnread = true;
        message.thread.markReadSequential(() =>
            rpc("/discuss/channel/set_new_message_separator", {
                channel_id: message.thread.id,
                message_id: message.id,
            })
        );
    },
    sequence: 50,
});
