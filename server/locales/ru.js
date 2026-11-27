// @ts-check

export default {
  translation: {
    appName: 'Менеджер задач',
    attributes: {
      name: 'Наименование',
      description: 'Описание',
      statusId: 'Статус',
      executorId: 'Исполнитель',
      firstName: 'Имя',
      lastName: 'Фамилия',
      email: 'Email',
      password: 'Пароль',
    },
    validation: {
      required: 'Не должно быть пустым',
      users: {
        emailTaken: 'Этот email уже зарегистрирован',
        emailInvalid: 'Некорректный email',
        passwordLength: 'Не меньше 3 символов',
      },
      tasks: {
        statusInvalid: 'Выберите существующий статус',
        executorInvalid: 'Выберите существующего пользователя',
      },
    },
    flash: {
      session: {
        create: {
          success: 'Вы залогинены',
          error: 'Неправильный емейл или пароль',
        },
        delete: {
          success: 'Вы разлогинены',
        },
      },
      users: {
        create: {
          error: 'Не удалось зарегистрировать',
          success: 'Пользователь успешно зарегистрирован',
        },
        update: {
          error: 'Не удалось изменить пользователя',
          success: 'Пользователь успешно изменён',
        },
        delete: {
          success: 'Пользователь удалён',
          blocked: 'Пользователь имеет связанные задачи',
        },
        noRights: 'У вас нет прав на это действие',
      },
      statuses: {
        create: {
          error: 'Не удалось создать статус',
          success: 'Статус успешно создан',
        },
        update: {
          error: 'Не удалось изменить статус',
          success: 'Статус успешно изменён',
        },
        delete: {
          success: 'Статус удалён',
          blocked: 'Статус используется в задачах',
        },
      },
      tasks: {
        create: {
          error: 'Не удалось создать задачу',
          success: 'Задача успешно создана',
        },
        update: {
          error: 'Не удалось изменить задачу',
          success: 'Задача успешно изменена',
        },
        delete: {
          success: 'Задача удалена',
        },
      },
      authError: 'Доступ запрещён! Пожалуйста, авторизируйтесь.',
    },
    layouts: {
      application: {
        users: 'Пользователи',
        statuses: 'Статусы',
        tasks: 'Задачи',
        signIn: 'Вход',
        signUp: 'Регистрация',
        signOut: 'Выход',
        footer: '© Hexlet Ltd, 2021',
      },
    },
    views: {
      session: {
        new: {
          signIn: 'Вход',
          submit: 'Войти',
        },
      },
      users: {
        id: 'ID',
        email: 'Email',
        createdAt: 'Дата создания',
        columns: {
          fullName: 'Полное имя',
          actions: 'Действия',
        },
        buttons: {
          edit: 'Изменить',
          delete: 'Удалить',
        },
        new: {
          submit: 'Сохранить',
          signUp: 'Регистрация',
        },
        edit: {
          edit: 'Редактирование пользователя',
          submit: 'Сохранить',
        },
      },
      statuses: {
        index: {
          index: 'Статусы',
        },
        columns: {
          id: 'ID',
          name: 'Наименование',
          createdAt: 'Дата создания',
        },
        buttons: {
          edit: 'Изменить',
          delete: 'Удалить',
        },
        new: {
          new: 'Создать статус',
          submit: 'Сохранить',
        },
        edit: {
          edit: 'Редактирование статуса',
          submit: 'Сохранить',
        },
      },
      tasks: {
        index: {
          index: 'Задачи',
          create: 'Создать задачу',
        },
        columns: {
          id: 'ID',
          name: 'Наименование',
          status: 'Статус',
          creator: 'Автор',
          executor: 'Исполнитель',
          createdAt: 'Дата создания',
        },
        buttons: {
          edit: 'Изменить',
          delete: 'Удалить',
        },
        new: {
          new: 'Создание задачи',
          submit: 'Создать',
        },
        edit: {
          edit: 'Изменение задачи',
          submit: 'Изменить',
        },
        show: {
          author: 'Автор',
          executor: 'Исполнитель',
          createdAt: 'Дата создания',
        },
        selects: {
          chooseStatus: 'Выберите статус',
          chooseExecutor: 'Выберите исполнителя',
        },
        filters: {
          status: 'Статус',
          executor: 'Исполнитель',
          label: 'Метка',
          onlyMine: 'Только мои задачи',
          submit: 'Показать',
        },
      },
      welcome: {
        index: {
          hello: 'Привет от Хекслета!',
          description: 'Практические курсы по программированию',
          more: 'Узнать Больше',
        },
      },
    },
  },
};
