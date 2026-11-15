import { _t } from "@web/core/l10n/translation";
import { download } from "@web/core/network/download";
import { registry } from "@web/core/registry";
import {
    Action,
    ACTION_TAGS,
    IS_ACTION_DEFINITION_SYM,
    useAction,
    UseActions,
} from "@mail/core/common/action";
import { useEmojiPicker } from "@web/core/emoji_picker/emoji_picker";
import { MessageReactionMenu } from "@mail/core/common/message_reaction_menu";
import { rpc } from "@web/core/network/rpc";
import { computed, useOnChange } from "@odoo/owl";

const { DateTime } = luxon;

export const messageActionsRegistry = registry.category("mail.message/actions");

/** @typedef {import("models").Message} Message */
/** @typedef {import("models").Thread} Thread */
/**
 * @typedef {Object} MessageActionInputs
 * @property {() => Message} message Current message, read when an action needs it.
 * @property {() => Thread|undefined} [thread] Thread in which the message is being viewed.
 * @property {import("@odoo/owl").Signal<HTMLElement>} [rootRef]
 * @property {import("@odoo/owl").Signal<HTMLElement>} [reactionAnchorRef] when set, the anchor element for reactions
 * @property {{close: () => void}} [menu] Menu containing the action buttons.
 * @property {() => boolean} [isActive] Whether the message is active in its rendering surface.
 * @property {(message: Message) => void} [onDeleted] Surface-specific work after confirming deletion.
 */
/**
 * @template {MessageActionInputs} [Inputs=MessageActionInputs]
 * @typedef {Inputs & {channel: () => import("models").DiscussChannel|undefined}} MessageActionBoundInputs
 * Channel is derived once per action set, without reading the thread eagerly.
 */
/**
 * @template {MessageActionInputs} [Inputs=MessageActionInputs]
 * @typedef {import("@mail/core/common/action").ActionParams<MessageAction, UseMessageActions_Def, MessageActionBoundInputs<Inputs>>} MessageActionParams
 */
/**
 * @template {MessageActionInputs} [Inputs=MessageActionInputs]
 * @typedef {import("@mail/core/common/action").ActionDefinition<MessageActionParams<Inputs>, MessageAction>} MessageActionDefinition
 */

/**
 * @param {string} id
 * @template {MessageActionInputs} [Inputs=MessageActionInputs]
 * @param {MessageActionDefinition<Inputs>} definition
 */
export function registerMessageAction(id, definition) {
    messageActionsRegistry.add(id, Object.assign(definition, { [IS_ACTION_DEFINITION_SYM]: true }));
}

registerMessageAction("reaction", {
    condition: ({ inputs }) => inputs.message().canAddReaction,
    icon: "add_reaction",
    name: _t("Add a Reaction"),
    onSelected({ action, inputs }) {
        const { reactionAnchorRef, rootRef } = inputs;
        const anchorEl = reactionAnchorRef
            ? reactionAnchorRef()
            : rootRef?.()?.querySelector(`[name="${this.id}"]`);
        return action.reactionPicker.open(() => anchorEl);
    },
    setup({ action, inputs }) {
        action.reactionPicker = useEmojiPicker(undefined, {
            onSelect: (emoji) => {
                const message = inputs.message();
                const self = inputs.thread?.()?.effectiveSelf ?? message.effectiveSelf;
                const reaction = message.reactions.find(
                    ({ content, personas }) => content === emoji && self.in(personas)
                );
                if (!reaction) {
                    message.react(emoji);
                }
            },
        });
        useOnChange(
            () => [inputs.message()],
            () => action.reactionPicker.close(),
            {
                initialRun: false,
            }
        );
    },
    sequence: 10,
});
registerMessageAction("reply-to", {
    condition: ({ inputs, ancestors }) => {
        const channel = inputs.channel();
        const message = inputs.message();
        if (ancestors.inMessagingMenu) {
            return false;
        }
        if (message.canReplyTo) {
            return true;
        }
        return !channel && !message.isEmpty && message.isNote && !message.isSelfAuthored;
    },
    icon: "reply",
    name: _t("Reply"),
    onSelected: ({ inputs, ancestors }) => {
        const message = inputs.message();
        const thread = inputs.thread?.();
        const composer = thread.composer;
        if (message.eq(composer.replyToMessage)) {
            composer.replyToMessage = undefined;
            return;
        }
        if (thread.channel) {
            composer.replyToMessage = message;
            return;
        }
        if (!message.isSelfAuthored && !message.thread?.channel && message.author) {
            composer.insertReplyFromNote(message);
        }
        ancestors.inChatter?.toggleComposer("note", { force: true });
        composer.restoredFromFullComposer = false;
        if (!composer.isFocused) {
            composer.autofocus++;
        }
    },
    sequence: ({ inputs }) => (inputs.message().isSelfAuthored ? 55 : 20),
});
registerMessageAction("add-bookmark", {
    condition: ({ inputs }) =>
        inputs.message().canToggleBookmark &&
        !inputs.message().isEmpty &&
        !inputs.message().is_bookmarked,
    icon: "bookmark",
    name: _t("Bookmark"),
    onSelected: ({ inputs }) => inputs.message().addBookmark(),
    sequence: 80,
});
registerMessageAction("remove-bookmark", {
    condition: ({ inputs }) => inputs.message().canToggleBookmark && inputs.message().is_bookmarked,
    icon: "bookmark",
    name: _t("Remove from Bookmarks"),
    onSelected: ({ inputs, ancestors }) => inputs.message().removeBookmark(ancestors),
    sequence: 80,
});
registerMessageAction("mark-as-read", {
    condition: ({ inputs }) => inputs.message().needaction,
    icon: "check",
    name: _t("Mark as Read"),
    onSelected: ({ inputs }) => inputs.message().setDone(),
    sequence: 35,
});
registerMessageAction("mark-as-unread", {
    condition: ({ inputs }) => inputs.message().canMarkAsUnread,
    icon: "visibility_off",
    name: _t("Mark as Unread"),
    onSelected: ({ inputs }) => inputs.message().markAsUnread(),
    sequence: 50,
});
registerMessageAction("reactions", {
    condition: ({ inputs }) => inputs.message().reactions.length,
    icon: "sentiment_satisfied",
    name: _t("View Reactions"),
    onSelected: ({ inputs, rootRef, store }) => {
        const message = inputs.message();
        store.env.services.dialog.add(MessageReactionMenu, { message }, { rootRef });
    },
    sequence: 60,
});
registerMessageAction("unfollow", {
    condition: ({ inputs, ancestors }) =>
        ancestors.inMessagingMenu && inputs.message().thread?.selfFollower,
    icon: "person_remove",
    name: _t("Unfollow"),
    onSelected: ({ inputs }) => inputs.message().unfollow(),
    sequence: 110,
});
registerMessageAction("edit", {
    condition: ({ inputs, ancestors }) => !ancestors.inMessagingMenu && inputs.message().editable,
    icon: "edit",
    name: _t("Edit"),
    onSelected: ({ inputs }) => {
        const message = inputs.message();
        message.enterEditMode();
        inputs.menu?.close();
    },
    sequence: ({ inputs }) => (inputs.message().isSelfAuthored ? 20 : 115),
});
registerMessageAction("delete", {
    condition: ({ inputs }) => inputs.message().deletable,
    icon: "delete",
    name: _t("Delete"),
    onSelected: ({ inputs, ancestors }) =>
        inputs.message().showDeleteConfirm({
            ancestors,
            rootRef: inputs.rootRef,
            onDeleted: inputs.onDeleted,
        }),
    sequence: 120,
    tags: ACTION_TAGS.DANGER,
});
registerMessageAction("download_files", {
    condition: ({ inputs, store }) =>
        inputs.message().attachment_ids.length > 1 && store.self_user?.share === false,
    icon: "download",
    name: _t("Download Files"),
    onSelected: ({ inputs }) =>
        download({
            data: {
                file_ids: inputs.message().attachment_ids.map((rec) => rec.id),
                zip_name: `attachments_${DateTime.local().toFormat("HHmmddMMyyyy")}.zip`,
            },
            url: "/mail/attachment/zip",
        }),
    sequence: 55,
});
registerMessageAction("toggle-translation", {
    condition: ({ inputs }) => inputs.message().isTranslatable,
    icon: "translate",
    iconClass: ({ inputs }) =>
        inputs.message().showTranslation ? "o-mail-Message-translated" : "",
    name: ({ inputs }) =>
        inputs.message().showTranslation ? _t("Initial Language") : _t("Translate"),
    onSelected: ({ inputs }) => {
        const message = inputs.message();
        message.toggleTranslation().then(() => {
            if (message.translationValue) {
                message.afterToggleTranslation();
            }
        });
    },
    sequence: 100,
});
registerMessageAction("copy-message", {
    condition: ({ inputs }) => inputs.message().canCopyMessageText,
    onSelected: ({ inputs }) => inputs.message().copyMessageText(),
    name: _t("Copy Text"),
    icon: "content_copy",
    sequence: 85,
});
registerMessageAction("copy-link", {
    condition: ({ inputs }) =>
        inputs.message().message_type &&
        inputs.message().message_type !== "user_notification" &&
        inputs.thread?.() &&
        (!inputs.thread?.().access_token || inputs.thread?.().hasReadAccess),
    icon: "link",
    name: _t("Copy Message Link"),
    onSelected: ({ inputs }) => inputs.message().copyLink(),
    sequence: 90,
});
registerMessageAction("end-poll", {
    condition: ({ inputs }) =>
        inputs.message().poll &&
        !inputs.message().poll.end_message_id &&
        inputs.message().poll.createdBySelf,
    icon: "oi_view-cohort",
    name: _t("End Poll"),
    onSelected: ({ inputs }) => rpc("/mail/poll/end", { poll_id: inputs.message().poll.id }),
    sequence: 115,
});

/** @extends {Action<MessageActionParams, MessageActionBoundInputs>} */
export class MessageAction extends Action {}

/** @typedef {UseActions<MessageActionParams, MessageAction, MessageActionBoundInputs>} UseMessageActions_Def */
/** @extends {UseActions<MessageActionParams, MessageAction, MessageActionBoundInputs>} */
class UseMessageActions extends UseActions {
    ActionClass = MessageAction;
}

/**
 * @template {MessageActionInputs} Inputs
 * @param {Inputs} inputs Shared dependencies; signals are passed through without being read.
 * @returns {UseMessageActions_Def}
 */
export function useMessageActions(inputs) {
    const actionInputs = { ...inputs, channel: computed(() => inputs.thread?.()?.channel) };
    return useAction(messageActionsRegistry, UseMessageActions, MessageAction, {
        inputs: actionInputs,
        rootRef: inputs.rootRef,
    });
}
