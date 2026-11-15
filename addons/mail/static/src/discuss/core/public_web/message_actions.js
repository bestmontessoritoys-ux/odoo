import { registerMessageAction } from "@mail/core/common/message_actions";
import { _t } from "@web/core/l10n/translation";

registerMessageAction("create-or-view-thread", {
    condition: ({ inputs }) =>
        !inputs.message().isEmpty &&
        inputs.message().channel_id?.eq(inputs.channel()) &&
        inputs.message().channel_id?.canCreateSubChannels,
    icon: "forum",
    onSelected: async ({ inputs, store }) => {
        const message = inputs.message();
        if (message.linkedSubChannel) {
            const subChannel = await store["discuss.channel"].getOrFetch(
                message.linkedSubChannel.id
            );
            subChannel?.open({ focus: true });
        } else {
            message.channel_id?.createSubChannel({ initialMessage: message });
        }
    },
    name: ({ inputs }) =>
        inputs.message().linkedSubChannel ? _t("View Thread") : _t("Create Thread"),
    sequence: 95,
});
